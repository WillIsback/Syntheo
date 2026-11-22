# /// script
# requires-python = "==3.12.*"
# dependencies = ["huggingface_hub==2.4.0"]
#
# [tool.uv]
# exclude-newer = "2026-11-08T00:00:00Z"
# ///
"""Envoi des modèles de syntheo-speech vers Hugging Face (issue 683).

Usage : uv run --locked --script hf_upload.py <dossier> <dépôt> <message> [--dry-run]
  <dossier>  arborescence à envoyer (nemotron/, diar/, README.md, licences)
  <dépôt>    par exemple WillisBack/syntheo-speech-models
  --dry-run  compare seulement, n'envoie rien

Le dossier doit exister et contenir chaque fichier de models.json, à sa
taille et à son SHA-256 ; sinon rien n'est envoyé (code 2).

Avant tout envoi, le dossier est comparé à la branche principale du dépôt :
si chaque fichier y est déjà, identique (SHA-256 pour un fichier LFS,
identifiant de blob git sinon), rien n'est envoyé et la révision existante
est rendue. Des fichiers en plus sur le dépôt (.gitattributes) n'empêchent
pas cette reprise.

Le jeton est lu dans la variable d'environnement HF_TOKEN, jamais en
argument ni dans un fichier, et n'est jamais affiché. Sortie : la révision
(SHA du commit Hugging Face) sur la dernière ligne de la sortie standard ;
les lignes précédentes disent si l'envoi a eu lieu.
Appelé par .github/workflows/publish-speech-models.yml.
"""

import hashlib
import os
import sys
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def local_files(folder: Path) -> dict[str, tuple[int, str, str]]:
    """Chemin relatif → (taille, SHA-256, identifiant de blob git)."""
    files = {}
    for path in sorted(p for p in folder.rglob("*") if p.is_file()):
        data = path.read_bytes()
        blob = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
        files[path.relative_to(folder).as_posix()] = (
            len(data),
            hashlib.sha256(data).hexdigest(),
            blob,
        )
    return files


def model_problems(
    local: dict[str, tuple[int, str, str]], models: list[dict]
) -> list[str]:
    """Fichiers de models.json absents du dossier, ou d'une autre taille ou
    empreinte : on n'envoie jamais un dépôt incomplet ou différent."""
    problems = []
    for entry in models:
        mine = local.get(entry["path"])
        if mine is None:
            problems.append(f"{entry['path']} absent")
        elif mine[0] != entry["size"] or mine[1] != entry["sha256"]:
            problems.append(f"{entry['path']} différent de models.json")
    return problems


def differences(
    local: dict[str, tuple[int, str, str]],
    remote: dict[str, tuple[int | None, str | None, str | None]],
) -> list[str]:
    """Fichiers locaux absents du dépôt ou différents. `remote` : chemin →
    (taille, SHA-256 LFS ou None, identifiant de blob git ou None)."""
    changed = []
    for name, (size, sha256, blob) in local.items():
        theirs = remote.get(name)
        if theirs is None:
            changed.append(name)
            continue
        their_size, their_sha256, their_blob = theirs
        same = (their_sha256 == sha256 if their_sha256 else their_blob == blob) and (
            their_size is None or their_size == size
        )
        if not same:
            changed.append(name)
    return changed


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv[1:]
    if len(args) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    folder, repo, message = args
    root = Path(folder)
    if not root.is_dir():
        print(f"dossier absent : {folder}", file=sys.stderr)
        return 2
    local = local_files(root)
    if not local:
        print(f"dossier vide : {folder}", file=sys.stderr)
        return 2
    import json

    models = json.loads(
        (Path(__file__).resolve().parent / "models.json").read_text(encoding="utf-8")
    )["files"]
    problems = model_problems(local, models)
    if problems:
        print("dossier refusé : " + " ; ".join(problems), file=sys.stderr)
        return 2
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("HF_TOKEN absent", file=sys.stderr)
        return 2
    from huggingface_hub import HfApi

    api = HfApi(token=token)
    info = api.model_info(repo, files_metadata=True)
    remote = {
        s.rfilename: (s.size, s.lfs.sha256 if s.lfs else None, s.blob_id)
        for s in info.siblings or []
    }
    changed = differences(local, remote)
    if not changed:
        print(f"identique au dépôt : rien n'est envoyé (révision {info.sha})")
        print(info.sha)
        return 0
    print(f"{len(changed)} fichier(s) à envoyer : {', '.join(changed)}")
    if dry_run:
        print("essai à blanc : rien n'est envoyé", file=sys.stderr)
        return 3
    result = api.upload_folder(
        repo_id=repo,
        repo_type="model",
        folder_path=folder,
        commit_message=message,
    )
    print(result.oid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
