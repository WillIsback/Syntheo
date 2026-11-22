"""Copie les modèles d'une arborescence (nemotron/…, diar/…) vers un dossier à
plat, un fichier par nom (assets d'une release GitHub), ou l'inverse.

Usage : python3 -I flatten.py <arborescence> <dossier à plat>
        python3 -I flatten.py --tree <dossier à plat> <arborescence>
Liste et chemins : models.json. Les noms doivent être uniques (verify.py
--flat le contrôle aussi).
"""

import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    args = sys.argv[1:]
    to_tree = bool(args) and args[0] == "--tree"
    if to_tree:
        args = args[1:]
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    source, dest = Path(args[0]), Path(args[1])
    files = json.loads((HERE / "models.json").read_text(encoding="utf-8"))["files"]
    names = [f["path"].rsplit("/", 1)[-1] for f in files]
    if len(set(names)) != len(names):
        print("noms de fichiers en double : impossible à plat", file=sys.stderr)
        return 1
    for entry, name in zip(files, names):
        tree_path, flat_path = entry["path"], name
        src = source / (flat_path if to_tree else tree_path)
        dst = dest / (tree_path if to_tree else flat_path)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
    return 0


if __name__ == "__main__":
    sys.exit(main())
