#!/usr/bin/env bash
# Runners GitHub : apt passe par la liste /etc/apt/apt-mirrors.txt, dont le
# premier miroir dépend de la région du runner. Un miroir régional qui répond
# mais sert les paquets à quelques dizaines de ko/s n'est jamais abandonné par
# apt (il ne change de miroir que sur une erreur) : l'installation atteint
# alors le garde-fou de 15 min (#604, release 0.7.3 bloquée, runs 44412365909
# et 44426158271). On mesure donc le débit du premier miroir sur un paquet du
# dépôt et, s'il est trop lent, on met en tête le plus rapide des candidats.
# Le miroir fautif est irrégulier (un téléchargement à 12 Mo/s, le suivant à
# 40 ko/s) : il est mesuré trois fois et jugé sur sa plus mauvaise mesure.
set -euo pipefail

list=${APT_MIRRORS_FILE:-/etc/apt/apt-mirrors.txt}
# Paquet de la poche « release » de noble (figée) : 10,9 Mo. Les index
# (dists/) ne conviennent pas, un miroir lent sur pool/ les sert vite.
probe=pool/main/i/icu/libicu74_74.2-1ubuntu3_amd64.deb
min_speed=$((512 * 1024)) # octets par seconde
# Candidats en HTTP : depuis les runners au miroir lent, la sonde en HTTPS vers
# archive.ubuntu.com rend 0 à 12 ko/s alors qu'apt y tire
# http://security.ubuntu.com sans difficulté (runs 44426158210 et
# 44426158271). Les trois servent l'archive complète.
candidates=(
  http://azure.archive.ubuntu.com/ubuntu/
  http://archive.ubuntu.com/ubuntu/
  http://security.ubuntu.com/ubuntu/
)

if [ ! -f "$list" ]; then
  echo "$list absent : miroirs apt inchangés"
  exit 0
fi

# Débit moyen en octets/s sur 4 s au plus ; 0 si le miroir ne sert pas le
# fichier. Le détail (code HTTP, erreur de curl) part sur la sortie d'erreur.
speed() {
  local out
  out=$(curl -s -o /dev/null --connect-timeout 4 --max-time 4 \
    -w '%{http_code} %{speed_download} %{errormsg}' "$1$probe" 2> /dev/null || true)
  echo "  $1 : ${out:-aucune réponse}" >&2
  awk '{ print ($1 == 200) ? int($2) : 0 }' <<< "${out:-0 0}"
}

# Plus mauvaise de trois mesures ; s'arrête à la première sous le seuil.
worst_speed() {
  local worst="" one
  for _ in 1 2 3; do
    one=$(speed "$1")
    if [ -z "$worst" ] || [ "$one" -lt "$worst" ]; then
      worst=$one
    fi
    if [ "$worst" -lt "$min_speed" ]; then
      break
    fi
  done
  echo "$worst"
}

current=$(awk '$1 ~ /^https?:\/\// { print $1; exit }' "$list")
if [ -z "$current" ]; then
  echo "Aucun miroir dans $list : miroirs apt inchangés"
  exit 0
fi

current_speed=$(worst_speed "$current")
echo "Miroir apt du runner : $current ($((current_speed / 1024)) ko/s)"
if [ "$current_speed" -ge "$min_speed" ]; then
  exit 0
fi

best=""
best_speed=$current_speed
for candidate in "${candidates[@]}"; do
  if [ "$candidate" = "$current" ]; then
    continue
  fi
  candidate_speed=$(worst_speed "$candidate")
  echo "Candidat : $candidate ($((candidate_speed / 1024)) ko/s)"
  if [ "$candidate_speed" -gt "$best_speed" ]; then
    best=$candidate
    best_speed=$candidate_speed
  fi
  # Un candidat au-dessus du seuil suffit : inutile de sonder les autres.
  if [ "$best_speed" -ge "$min_speed" ]; then
    break
  fi
done

if [ -z "$best" ]; then
  echo "Aucun candidat ne fait mieux : miroirs apt inchangés"
  exit 0
fi

echo "::warning::Miroir apt lent ($current, $((current_speed / 1024)) ko/s) : remplacé par $best ($((best_speed / 1024)) ko/s)"
# Le miroir retenu passe en tête ; les autres entrées de la liste restent en
# repli, sauf le miroir lent.
new_list=$(
  printf '%s\tpriority:1\n' "$best"
  awk -v slow="$current" -v best="$best" \
    '$1 ~ /^https?:\/\// && $1 != slow && $1 != best { printf "%s\tpriority:%d\n", $1, ++n + 1 }' "$list"
)
if [ -w "$list" ]; then
  printf '%s\n' "$new_list" > "$list"
else
  printf '%s\n' "$new_list" | sudo tee "$list" > /dev/null
fi
cat "$list"
