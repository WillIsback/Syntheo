#!/usr/bin/env bash
# Contrôle des paquets .deb repris du cache Actions (issue 604) avant qu'apt
# ne s'en serve. apt ne revérifie pas un fichier déjà présent dans son
# dossier d'archives : à taille égale, il le passe tel quel à dpkg (vérifié
# sous Ubuntu 24.04 avec un octet modifié). Chaque .deb est donc comparé à
# l'empreinte SHA-256 des index signés, lus après `apt-get update` ; un
# fichier inconnu des index ou d'empreinte différente est supprimé, apt le
# retélécharge.
# Usage : apt-cache-verify.sh <dossier des archives>
set -euo pipefail

dir=${1:?dossier des archives attendu}
kept=0
removed=0

shopt -s nullglob
for deb in "$dir"/*.deb; do
  base=${deb##*/}
  # apt nomme le fichier nom_version_arch.deb, l'époque de la version écrite
  # %3a ; dans le dépôt (champ Filename des index), le nom n'a pas d'époque.
  IFS=_ read -r name version arch <<< "${base%.deb}"
  version=${version//%3a/:}
  pool_file="${name}_${version#*:}_${arch}.deb"
  expected=$(apt-cache show "$name=$version" 2> /dev/null |
    awk -v file="$pool_file" '
      /^Filename: / { n = split($2, parts, "/"); match_file = (parts[n] == file) }
      /^SHA256: / && match_file { print $2; exit }
    ' || true)
  actual=$(sha256sum "$deb" | cut -d' ' -f1)
  if [ -n "$expected" ] && [ "$expected" = "$actual" ]; then
    kept=$((kept + 1))
  else
    sudo rm -f "$deb"
    removed=$((removed + 1))
  fi
done

echo "Cache apt : $kept paquets conformes aux index, $removed supprimés."
