# /// script
# requires-python = "==3.12.*"
# dependencies = ["pyarrow==20.0.0"]
# ///
"""Reconstruit le corpus de WER français de Syntheo (issue 788) depuis ses sources.

Usage :
  uv run --locked --script apps/speech/wer-corpus/prepare.py <dossier neuf hors du dépôt>
  uv run --locked --script apps/speech/wer-corpus/prepare.py --check \\
      <fleurs test.tsv> <dossier audio FLEURS test> <parquet MLS>

Le corpus compte 150 énoncés : 100 de FLEURS fr_fr (split test) et 50 de
Multilingual LibriSpeech french (split test), listés
dans utterances.tsv avec leur fichier d'origine, son empreinte et la
référence. Le dépôt ne contient aucun audio.

Sans --check, le script télécharge les fichiers source de sources.json,
vérifie leurs empreintes, refait le tirage (graines de sources.json) et
vérifie qu'il redonne exactement les énoncés listés, extrait ces énoncés,
vérifie l'empreinte de chacun, les convertit en WAV 16 kHz mono PCM16 avec
ffmpeg (comme lors de la mesure), puis écrit dans le dossier de sortie :
wav/<id>.wav, refs.tsv (id, corpus, référence ; l'entrée de score.py) et
ATTRIBUTION.md. Il compare enfin l'empreinte de chaque WAV à celle de la
mesure : un écart (« ÉCART ») peut venir d'une autre version de ffmpeg et
n'arrête pas le script.

Avec --check, rien n'est téléchargé ni écrit : le script relit des fichiers
source déjà présents sur ce poste et vérifie empreintes, tirage et références.

Dépendances : pyarrow (figé par prepare.py.lock), ffmpeg dans le PATH (sauf
--check).
"""

import csv
import hashlib
import io
import json
import random
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_manifest() -> list[dict[str, str]]:
    with (HERE / "utterances.tsv").open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE))


def url(source: dict, file: str) -> str:
    revision = source["revision"] or "main"
    return f"{source['repository']}/resolve/{revision}/{file}"


def fetch(address: str) -> bytes:
    print(f"téléchargement : {address}", file=sys.stderr)
    with urllib.request.urlopen(address) as response:
        return response.read()


def check_sha(name: str, data: bytes, expected: str | None) -> None:
    actual = sha256(data)
    if expected is None:
        print(f"non vérifié {name} {actual} (empreinte inconnue)", file=sys.stderr)
    elif actual != expected:
        sys.exit(f"{name} : empreinte {actual}, attendue {expected}")


def draw_fleurs(tsv: bytes, seed: int, count: int) -> list[tuple[str, str, str]]:
    """Tirage FLEURS : `count` phrases distinctes, puis un enregistrement par
    phrase. Rend (id, fichier, transcription brute)."""
    by_sentence: dict[str, list[tuple[str, str]]] = {}
    reader = csv.reader(
        io.StringIO(tsv.decode("utf-8")), delimiter="\t", quoting=csv.QUOTE_NONE
    )
    for line in reader:
        by_sentence.setdefault(line[0], []).append((line[1], line[2]))
    rng = random.Random(seed)
    drawn = []
    for sentence in rng.sample(sorted(by_sentence), count):
        file_name, raw = rng.choice(sorted(by_sentence[sentence]))
        drawn.append((f"fleurs-{sentence}", f"test/{file_name}", raw))
    return drawn


def draw_mls(rows: list[dict], seed: int, count: int) -> list[dict]:
    """Tirage MLS : `count` énoncés parmi les lignes triées par identifiant."""
    rows = sorted(rows, key=lambda r: r["id"])
    return random.Random(seed).sample(rows, count)


def check_draws(spec: dict, manifest, tsv: bytes, parquet) -> dict[str, bytes]:
    """Refait les deux tirages, vérifie qu'ils redonnent le manifeste et rend
    l'audio MLS d'origine (opus) de chaque énoncé tiré."""
    import pyarrow.parquet as pq

    fleurs = spec["fleurs"]
    mls = spec["mls"]
    expected = {row["id"]: row for row in manifest}
    drawn_ids = []
    for ident, file_name, raw in draw_fleurs(tsv, fleurs["seed"], fleurs["count"]):
        row = expected.get(ident)
        if row is None or row["source_file"] != file_name or row["reference"] != raw:
            sys.exit(f"tirage FLEURS : {ident} ne correspond pas à utterances.tsv")
        drawn_ids.append(ident)
    table = pq.read_table(parquet).to_pylist()
    audio = {}
    for record in draw_mls(table, mls["seed"], mls["count"]):
        ident = f"mls-{record['id']}"
        row = expected.get(ident)
        if (
            row is None
            or row["source_file"] != record["file"]
            or row["reference"] != record["transcript"]
        ):
            sys.exit(f"tirage MLS : {ident} ne correspond pas à utterances.tsv")
        data = record["audio"]["bytes"]
        check_sha(ident, data, row["source_sha256"])
        audio[ident] = data
        drawn_ids.append(ident)
    if drawn_ids != [row["id"] for row in manifest]:
        sys.exit("tirage : ordre ou nombre d'énoncés différent de utterances.tsv")
    return audio


def check_local(
    spec: dict, manifest, tsv_path: Path, audio_dir: Path, parquet: Path
) -> None:
    tsv = tsv_path.read_bytes()
    check_sha("FLEURS test.tsv", tsv, spec["fleurs"]["tsv"]["sha256"])
    check_sha("MLS parquet", parquet.read_bytes(), spec["mls"]["parquet"]["sha256"])
    check_draws(spec, manifest, tsv, parquet)
    for row in manifest:
        if row["corpus"] == "fleurs":
            name = Path(row["source_file"]).name
            check_sha(row["id"], (audio_dir / name).read_bytes(), row["source_sha256"])
    print(f"ok {len(manifest)} énoncés : empreintes, tirage et références conformes")


def to_wav(src: Path, dst: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-loglevel", "error", "-y", "-i", str(src),
            "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", str(dst),
        ],
        check=True,
    )  # fmt: skip


def build(spec: dict, manifest, out: Path) -> None:
    if out.is_relative_to(REPO):
        sys.exit(
            f"{out} est dans le dépôt : choisir un dossier de sortie hors du dépôt"
        )
    if out.exists() and any(out.iterdir()):
        sys.exit(f"{out} n'est pas vide : choisir un dossier de sortie neuf")
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg introuvable dans le PATH")
    fleurs = spec["fleurs"]
    mls = spec["mls"]

    tsv = fetch(url(fleurs, fleurs["tsv"]["file"]))
    check_sha("FLEURS test.tsv", tsv, fleurs["tsv"]["sha256"])
    parquet = fetch(url(mls, mls["parquet"]["file"]))
    check_sha("MLS parquet", parquet, mls["parquet"]["sha256"])
    mls_audio = check_draws(spec, manifest, tsv, io.BytesIO(parquet))

    # Énoncés FLEURS par nom de fichier, quel que soit le dossier dans l'archive.
    wanted = {
        Path(row["source_file"]).name: row
        for row in manifest
        if row["corpus"] == "fleurs"
    }
    out.mkdir(parents=True, exist_ok=True)
    wav_dir = out / "wav"
    wav_dir.mkdir()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        archive = tmp / "fleurs-test.tar.gz"
        address = url(fleurs, fleurs["audio"]["file"])
        print(f"téléchargement : {address}", file=sys.stderr)
        with urllib.request.urlopen(address) as response, archive.open("wb") as f:
            shutil.copyfileobj(response, f)
        check_sha("FLEURS test.tar.gz", archive.read_bytes(), fleurs["audio"]["sha256"])
        sources = {}
        with tarfile.open(archive, "r:gz") as tar:
            for member in tar:
                name = Path(member.name).name
                if member.isfile() and name in wanted:
                    data = tar.extractfile(member).read()
                    row = wanted[name]
                    check_sha(row["id"], data, row["source_sha256"])
                    sources[row["id"]] = data
        missing = [row["id"] for row in wanted.values() if row["id"] not in sources]
        if missing:
            sys.exit(f"FLEURS : énoncés absents de l'archive : {', '.join(missing)}")
        sources.update(mls_audio)

        gaps = 0
        for row in manifest:
            src = tmp / Path(row["source_file"]).name
            src.write_bytes(sources[row["id"]])
            dst = wav_dir / f"{row['id']}.wav"
            to_wav(src, dst)
            src.unlink()
            actual = sha256(dst.read_bytes())
            if actual != row["wav_sha256"]:
                gaps += 1
                print(f"ÉCART {row['id']} {actual}")

    with (out / "refs.tsv").open("w", encoding="utf-8", newline="") as f:
        for row in manifest:
            f.write(f"{row['id']}\t{row['corpus']}\t{row['reference']}\n")
    shutil.copyfile(HERE / "ATTRIBUTION.md", out / "ATTRIBUTION.md")
    print(
        f"{len(manifest)} énoncés dans {out} ; "
        f"WAV identiques à la mesure : {len(manifest) - gaps}/{len(manifest)}"
    )


def main() -> None:
    args = sys.argv[1:]
    spec = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    manifest = load_manifest()
    if len(args) == 4 and args[0] == "--check":
        check_local(spec, manifest, *map(Path, args[1:]))
    elif len(args) == 1 and not args[0].startswith("-"):
        build(spec, manifest, Path(args[0]).resolve())
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
