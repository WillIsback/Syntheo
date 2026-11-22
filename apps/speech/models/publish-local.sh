#!/usr/bin/env bash
# Publication des modèles de syntheo-speech, partie locale (issue 683).
#
# La quantification ne tient pas sur un runner GitHub gratuit : elle se fait
# ici, puis la CI (publish-speech-models.yml, environnement speech-models
# avec validation) vérifie, atteste, publie en prerelease et envoie vers
# Hugging Face depuis le brouillon créé par ce script.
#
# Étapes :
#   1. quantification par quantize.py (uv --locked) dans un dossier neuf ;
#   2. contrôle bloquant de chaque fichier contre models.json (verify.py) ;
#   3. assemblage à plat : un fichier par asset, SHA256SUMS, accord
#      OpenMDW-1.1, fiches NVIDIA d'origine et notes de l'export ;
#   4. création d'une release GitHub en BROUILLON <version>, jamais publiée
#      ni marquée « latest » ici, puis dépôt des fichiers ;
#   5. contrôle bloquant après envoi : téléchargement du brouillon et
#      vérification contre models.json.
# Refus si une release ou un tag <version> existe déjà.
#
# Usage : bash apps/speech/models/publish-local.sh <version> [--dry-run]
#   <version>  speech-models-N
#   --dry-run  étapes 1 à 3 seulement, rien n'est envoyé.
# Variables : SYNTHEO_SPEECH_SOURCES (cache des sources de quantize.py),
# SPEECH_MODELS_REPO (défaut WillIsback/Syntheo). Authentification : celle de
# `gh` (gh auth login), jamais un jeton en argument.

set -euo pipefail

die() {
  echo "Erreur : $*" >&2
  exit 1
}

HERE=$(cd "$(dirname "$0")" && pwd)
VERSION=${1:-}
DRY_RUN=false
[ "${2:-}" = "--dry-run" ] && DRY_RUN=true
[[ "$VERSION" =~ ^speech-models-[0-9]+$ ]] || die "version attendue : speech-models-N (reçu « $VERSION »)."
REPO=${SPEECH_MODELS_REPO:-WillIsback/Syntheo}
for cmd in uv python3 sha256sum; do
  command -v "$cmd" > /dev/null || die "$cmd introuvable."
done
if ! $DRY_RUN; then
  command -v gh > /dev/null || die "gh introuvable."
  gh auth status > /dev/null 2>&1 || die "gh n'est pas authentifié (gh auth login)."
  # Brouillons compris (un brouillon n'a pas de tag : liste des releases).
  existing=$(gh api --paginate "repos/$REPO/releases" --jq ".[] | select(.tag_name == \"$VERSION\") | .id")
  [ -z "$existing" ] || die "une release $VERSION (brouillon ou non) existe déjà sur $REPO."
  if gh api "repos/$REPO/git/ref/tags/$VERSION" > /dev/null 2>&1; then
    die "le tag $VERSION existe déjà sur $REPO."
  fi
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/syntheo-speech-models.XXXXXX")
echo "-- dossier de travail : $WORK"

# 1. Quantification dans un dossier neuf (quantize.py vérifie déjà chaque
# source et chaque fichier produit).
uv run --locked --script "$HERE/quantize.py" "$WORK/models"

# 2. Contrôle bloquant, indépendant de quantize.py.
python3 -I "$HERE/verify.py" "$WORK/models"

# 3. Assemblage à plat : un asset par fichier (noms uniques, verify.py le
# contrôle), sommes, accord et avis d'origine.
FLAT="$WORK/release"
mkdir -p "$FLAT"
python3 -I "$HERE/flatten.py" "$WORK/models" "$FLAT"
(cd "$FLAT" && sha256sum -- * > SHA256SUMS)
NOTICES="$HERE/../supply-chain/notices/models"
cp "$NOTICES/LICENSE.OpenMDW-1.1" "$FLAT/"
for card in "$NOTICES"/*.md; do
  cp "$card" "$FLAT/NOTICE.$(basename "$card")"
done
python3 -I "$HERE/verify.py" "$FLAT" --flat
cp "$HERE/release-notes.md" "$WORK/notes.md"

if $DRY_RUN; then
  echo "-- essai à blanc : rien n'est envoyé. Fichiers prêts dans $FLAT"
  exit 0
fi

# 4. Brouillon : invisible du public ; ni publié ni « latest » ici (la CI le
# passera en prerelease, make_latest=false).
gh release create "$VERSION" --repo "$REPO" --draft --latest=false --target main \
  --title "Modèles de syntheo-speech ($VERSION)" --notes-file "$WORK/notes.md" \
  "$FLAT"/*

# 5. Contrôle après envoi, depuis le brouillon.
CHECK="$WORK/check"
mkdir -p "$CHECK"
bash "$HERE/download-draft.sh" "$REPO" "$VERSION" "$CHECK"
python3 -I "$HERE/verify.py" "$CHECK" --flat
state=$(gh api --paginate "repos/$REPO/releases" --jq ".[] | select(.tag_name == \"$VERSION\") | .draft")
[ "$state" = "true" ] || die "la release $VERSION n'est plus un brouillon unique."
echo "-- brouillon $VERSION prêt sur $REPO ; la CI (publish-speech-models.yml) prend la suite."
echo "-- dossier de travail conservé : $WORK (à supprimer à la main)"
