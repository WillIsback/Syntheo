"""Contrôle des modèles de syntheo-speech contre models.json (issue 683).

Chaque fichier de models.json doit être présent avec exactement sa taille et
son SHA-256 ; c'est la seule référence, pour toutes les sources (release
GitHub, Hugging Face, miroir, dossier local).

Usage : python3 -I verify.py <dossier> [--flat]
  --flat  fichiers à plat (assets d'une release : nom seul), sinon
          arborescence (nemotron/encoder.onnx…). Avec --flat, SHA256SUMS
          du dossier, s'il existe, doit lister les mêmes empreintes.
Sortie non nulle au premier écart (tous les écarts sont listés).
"""

import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--flat"]
    flat = "--flat" in sys.argv[1:]
    if len(args) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    root = Path(args[0])
    files = json.loads((HERE / "models.json").read_text(encoding="utf-8"))["files"]
    names = [f["path"].rsplit("/", 1)[-1] for f in files]
    if flat and len(set(names)) != len(names):
        print("noms de fichiers en double : impossible à plat", file=sys.stderr)
        return 1
    failures = 0
    for entry, name in zip(files, names):
        path = root / (name if flat else entry["path"])
        if not path.is_file() or path.is_symlink():
            print(f"ABSENT  {entry['path']}")
            failures += 1
            continue
        size, actual = path.stat().st_size, sha256(path)
        ok = size == entry["size"] and actual == entry["sha256"]
        failures += not ok
        print(f"{'ok    ' if ok else 'ÉCART '} {entry['path']} {size} {actual}")
    sums = root / "SHA256SUMS"
    if flat and sums.is_file():
        listed = {}
        for line in sums.read_text(encoding="utf-8").splitlines():
            if line.strip():
                digest, _, name = line.partition("  ")
                listed[name.lstrip("./")] = digest
        for entry, name in zip(files, names):
            if listed.get(name) != entry["sha256"]:
                print(f"SHA256SUMS ne correspond pas pour {name}")
                failures += 1
    if failures:
        print(f"{failures} écart(s) avec models.json", file=sys.stderr)
        return 1
    print(f"{len(files)} fichier(s) conformes à models.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
