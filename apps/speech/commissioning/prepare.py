# /// script
# requires-python = "==3.12.*"
# dependencies = ["pyarrow==20.0.0", "soundfile==0.13.1", "numpy==2.2.6", "scipy==1.15.3"]
# ///
"""Prépare l'audio de mise en service du module (issue 686) depuis MLS French.

Usage : uv run --locked --script apps/speech/commissioning/prepare.py <dossier de sortie neuf>

Télécharge le fichier « 1 heure » de MLS French à la révision figée de
sources.json, vérifie son empreinte, prend les énoncés listés (deux
locuteurs, deux livres), les décode (Opus), les rééchantillonne en 16 kHz,
les met bout à bout, insère 1,2 s de silence aux pauses naturelles (tours de
parole) et coupe à 30 s : mic.wav et sys.wav, 16 kHz mono PCM16. Écrit aussi l'empreinte de chaque fichier produit.
"""

import hashlib
import io
import json
import shutil
import sys
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
RATE = 16_000


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


GAP_S = 1.2
MIN_SEGMENT_S = 3.0
QUIET_S = 0.15


def with_turns(audio, np):
    """Coupe la lecture continue aux pauses naturelles (au moins 150 ms de
    faible énergie), en morceaux d'au moins 3 s, séparés par 1,2 s de
    silence : le module ferme un énoncé à chaque silence (1 s), comme aux
    tours de parole d'une réunion, ce qui donne des finals à mesurer."""
    frame = RATE // 50
    frames = len(audio) // frame
    energy = np.sqrt(np.mean(audio[: frames * frame].reshape(frames, frame) ** 2, axis=1))
    threshold = 0.25 * np.median(energy)
    quiet = energy < threshold
    need = int(QUIET_S * 50)
    cuts = []
    start = 0
    run = 0
    for index, is_quiet in enumerate(quiet):
        run = run + 1 if is_quiet else 0
        if run == need and (index * frame - start) >= MIN_SEGMENT_S * RATE:
            cut = (index - need // 2) * frame
            cuts.append(cut)
            start = cut
    pieces = []
    previous = 0
    gap = np.zeros(int(GAP_S * RATE))
    for cut in cuts + [len(audio)]:
        pieces.append(audio[previous:cut])
        pieces.append(gap)
        previous = cut
    return np.concatenate(pieces)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1]).resolve()
    if out.exists() and any(out.iterdir()):
        sys.exit(f"{out} n'est pas vide : choisir un dossier de sortie neuf")
    out.mkdir(parents=True, exist_ok=True)
    spec = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    source = spec["source"]
    url = f"{source['repository']}/resolve/{source['revision']}/{source['file']}"
    with urllib.request.urlopen(url) as response:
        data = response.read()
    if sha256(data) != source["sha256"]:
        sys.exit("source : empreinte différente de sources.json")

    import numpy as np
    import pyarrow.parquet as pq
    import soundfile as sf
    from scipy.signal import resample_poly

    table = pq.read_table(io.BytesIO(data))
    rows = {row["id"]: row for row in table.to_pylist()}
    for name, track in spec["tracks"].items():
        pieces = []
        for utterance in track["utterances"]:
            audio, rate = sf.read(io.BytesIO(rows[utterance]["audio"]["bytes"]), dtype="float64")
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            if rate != RATE:
                if rate % RATE:
                    sys.exit(f"{utterance} : fréquence {rate} inattendue")
                audio = resample_poly(audio, 1, rate // RATE)
            pieces.append(audio)
        audio = with_turns(np.concatenate(pieces), np)[: spec["seconds"] * RATE]
        if len(audio) < spec["seconds"] * RATE:
            sys.exit(f"{name} : moins de {spec['seconds']} s d'audio")
        pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).round().astype("<i2").tobytes()
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes(pcm)
        (out / name).write_bytes(buffer.getvalue())
        expected = track.get("sha256")
        actual = sha256(buffer.getvalue())
        status = "ok " if expected == actual else "ÉCART"
        print(f"{status} {name} {actual}")
    shutil.copyfile(HERE / "ATTRIBUTION.md", out / "ATTRIBUTION.md")


if __name__ == "__main__":
    main()
