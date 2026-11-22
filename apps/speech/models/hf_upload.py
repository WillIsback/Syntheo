# /// script
# requires-python = "==3.12.*"
# dependencies = ["huggingface_hub==2.4.0"]
#
# [tool.uv]
# exclude-newer = "2026-11-08T00:00:00Z"
# ///
"""Envoi des modèles de syntheo-speech vers Hugging Face (issue 683).

Usage : uv run --locked --script hf_upload.py <dossier> <dépôt> <message>
  <dossier>  arborescence à envoyer (nemotron/, diar/, README.md, licences)
  <dépôt>    par exemple WillisBack/syntheo-speech-models

Le jeton est lu dans la variable d'environnement HF_TOKEN, jamais en
argument ni dans un fichier, et n'est jamais affiché. Sortie : la révision
(SHA du commit Hugging Face) sur la dernière ligne de la sortie standard.
Appelé par .github/workflows/publish-speech-models.yml.
"""

import os
import sys

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    folder, repo, message = sys.argv[1:]
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("HF_TOKEN absent", file=sys.stderr)
        return 2
    from huggingface_hub import HfApi

    api = HfApi(token=token)
    info = api.upload_folder(
        repo_id=repo,
        repo_type="model",
        folder_path=folder,
        commit_message=message,
    )
    print(info.oid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
