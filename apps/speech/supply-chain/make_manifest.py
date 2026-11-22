"""Manifeste d'un module construit (issue 683).

Écrit `manifest.json` et `files.sha256` dans le dossier du module construit :
chaque fichier du dossier (binaire, bibliothèques, licences) avec son
empreinte et sa taille, puis les modèles de models.json, sous `models/`, avec
leur URL de téléchargement. Le manifeste est ensuite signé (manifest.json.sig)
par le job de signature ; speech-host le vérifie avant `files.sha256`.

Usage : python3 -I make_manifest.py <dossier> <cible> <version min. de l'app> <URL de base des modèles> [reconstruction]

Numéro de construction (anti-retour) : dérivé de la version minimale de
l'application, (MAJEUR·10⁶ + MINEUR·10³ + CORRECTIF)·100 + reconstruction
(0 à 99, 0 par défaut). Monotone d'une release à l'autre ; l'application
refuse un module dont la construction est inférieure à la plus haute déjà
acceptée.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEECH = HERE.parent
META = {"manifest.json", "manifest.json.sig", "files.sha256"}
PROTOCOL = 1


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def module_version() -> str:
    cargo = (SPEECH / "Cargo.toml").read_text(encoding="utf-8")
    match = re.search(r'^version = "([^"]+)"', cargo, re.MULTILINE)
    if not match:
        sys.exit("version du module introuvable")
    return match.group(1)


def main() -> None:
    if len(sys.argv) not in (5, 6):
        sys.exit(__doc__)
    out, target, min_app, base_url = (
        Path(sys.argv[1]),
        sys.argv[2],
        sys.argv[3],
        sys.argv[4],
    )
    if not re.fullmatch(r"\d+\.\d+\.\d+", min_app) or not base_url.startswith(
        "https://"
    ):
        sys.exit("version minimale x.y.z et URL https:// attendues")
    rebuild = sys.argv[5] if len(sys.argv) == 6 else "0"
    if not rebuild.isdigit() or int(rebuild) > 99:
        sys.exit("reconstruction : entier de 0 à 99")
    major, minor, patch = (int(part) for part in min_app.split("."))
    if minor > 999 or patch > 999:
        sys.exit("version minimale hors plage")
    build = (major * 1_000_000 + minor * 1_000 + patch) * 100 + int(rebuild)
    files = []
    for path in sorted(p for p in out.rglob("*") if p.is_file() or p.is_symlink()):
        relative = path.relative_to(out).as_posix()
        # Les modèles viennent de models.json, pas du dossier construit.
        if relative in META or relative.startswith("models/"):
            continue
        if path.is_symlink():
            sys.exit(f"lien symbolique refusé : {relative}")
        files.append(
            {"path": relative, "sha256": sha256(path), "size": path.stat().st_size}
        )
    models_spec = json.loads(
        (SPEECH / "models" / "models.json").read_text(encoding="utf-8")
    )
    models = [
        {
            "path": f"models/{entry['path']}",
            "sha256": entry["sha256"],
            "size": entry["size"],
            "url": f"{base_url.rstrip('/')}/{entry['path'].replace('/', '--')}",
        }
        for entry in models_spec["files"]
    ]
    manifest = {
        "schema": 1,
        "module": "syntheo-speech",
        "version": module_version(),
        "build": build,
        "protocol": PROTOCOL,
        "engine": "parakeet",
        "target": target,
        "min_app_version": min_app,
        "files": files,
        "models": models,
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    lines = [f"{e['sha256']}  {e['path']}\n" for e in files + models]
    (out / "files.sha256").write_text("".join(lines), encoding="utf-8", newline="\n")
    print(f"{len(files)} fichier(s), {len(models)} modèle(s)")


if __name__ == "__main__":
    main()
