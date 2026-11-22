"""Télécharge les modèles de syntheo-speech depuis les `sources` de models.json
(issue 683), comme l'application : pour chaque fichier, chaque gabarit est
essayé dans l'ordre (`{path}` : chemin dans l'arborescence, `{name}` : nom
seul), et seul un fichier de la taille et du SHA-256 de models.json est
gardé.

Usage : python3 -I fetch.py <dossier neuf>
Sortie : l'arborescence de models.json (nemotron/…, diar/…). Code non nul si
un fichier n'a pu être obtenu d'aucune source.
"""

import hashlib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def download(url: str, dest: Path, size: int, expected: str) -> bool:
    if not url.startswith("https://"):
        return False
    digest = hashlib.sha256()
    partial = dest.with_name(dest.name + ".part")
    try:
        with urllib.request.urlopen(url, timeout=60) as response, partial.open(
            "wb"
        ) as out:
            for block in iter(lambda: response.read(1 << 20), b""):
                digest.update(block)
                out.write(block)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        print(f"  {url} : {error}")
        partial.unlink(missing_ok=True)
        return False
    if partial.stat().st_size != size or digest.hexdigest() != expected:
        print(f"  {url} : taille ou empreinte différente de models.json")
        partial.unlink()
        return False
    partial.replace(dest)
    return True


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    out = Path(sys.argv[1]).resolve()
    if out.exists() and any(out.iterdir()):
        print(f"{out} n'est pas vide : choisir un dossier neuf", file=sys.stderr)
        return 2
    manifest = json.loads((HERE / "models.json").read_text(encoding="utf-8"))
    failures = 0
    for entry in manifest["files"]:
        path = entry["path"]
        dest = out / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        for template in manifest["sources"]:
            url = template.replace("{path}", path).replace(
                "{name}", path.rsplit("/", 1)[-1]
            )
            if download(url, dest, entry["size"], entry["sha256"]):
                print(f"ok     {path} ({url})")
                break
        else:
            print(f"ÉCHEC  {path} : aucune source ne sert ce fichier")
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
