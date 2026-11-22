#!/usr/bin/env bash
# Empreinte d'un dossier (issue 683) : SHA-256 de la liste triée
# « <sha256>  <chemin relatif> » de ses fichiers. Même résultat sous Linux et
# sous Git Bash (Windows) : les empreintes sont lues sur l'entrée standard,
# sans le format de nom propre à chaque sha256sum.
#
# Usage : tree-digest.sh <dossier>
set -euo pipefail
cd "$1"
find . -type f -print | LC_ALL=C sort | while IFS= read -r file; do
  printf '%s  %s\n' "$(sha256sum < "$file" | cut -d' ' -f1)" "$file"
done | sha256sum | cut -d' ' -f1
