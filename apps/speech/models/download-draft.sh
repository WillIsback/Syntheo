#!/usr/bin/env bash
# Télécharge les assets d'une release encore en brouillon (issue 683) : un
# brouillon n'a pas de tag, on le trouve par son nom de tag dans la liste des
# releases, puis on lit chaque asset par l'API (droit `contents: write` ou
# propriétaire nécessaire pour voir un brouillon).
#
# Usage : bash download-draft.sh <dépôt> <version> <dossier> [prerelease]
#   prerelease : lit la prerelease déjà publiée (reprise du workflow de
#   publication après un échec côté Hugging Face) au lieu du brouillon.
# Authentification : celle de `gh` (GH_TOKEN en CI).
set -euo pipefail
REPO=$1 VERSION=$2 DEST=$3 STATE=${4:-draft}
case "$STATE" in
  draft) filter=".draft == true" ;;
  prerelease) filter=".draft == false and .prerelease == true" ;;
  *) echo "Erreur : état inconnu : $STATE" >&2; exit 1 ;;
esac
id=$(gh api --paginate "repos/$REPO/releases" --jq ".[] | select(.tag_name == \"$VERSION\" and $filter) | .id")
[ -n "$id" ] && [ "$(printf '%s\n' "$id" | wc -l)" = 1 ] || {
  echo "Erreur : release $VERSION ($STATE) introuvable ou multiple sur $REPO." >&2
  exit 1
}
mkdir -p "$DEST"
gh api --paginate "repos/$REPO/releases/$id/assets" --jq '.[] | "\(.id)\t\(.name)"' |
  while IFS=$'\t' read -r asset name; do
    case "$name" in */* | .* | "") echo "Erreur : nom d'asset refusé : $name" >&2; exit 1 ;; esac
    gh api -H "Accept: application/octet-stream" "repos/$REPO/releases/assets/$asset" > "$DEST/$name"
  done
