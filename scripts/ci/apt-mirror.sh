#!/usr/bin/env bash
# Runners GitHub : apt passe par la liste /etc/apt/apt-mirrors.txt, dont le
# premier miroir dépend de la région du runner. Un miroir régional qui répond
# mais sert les paquets à quelques dizaines de ko/s n'est jamais abandonné par
# apt (il ne change de miroir que sur une erreur) : l'installation atteint
# alors le garde-fou de 15 min (#604, release 0.7.3 bloquée, run 44412365909).
# On mesure donc le débit du premier miroir sur un paquet du dépôt et, s'il
# est trop lent, on le retire de la liste quand le miroir suivant fait mieux.
set -euo pipefail

list=${APT_MIRRORS_FILE:-/etc/apt/apt-mirrors.txt}
# Paquet de la poche « release » de noble (figée) : 10,9 Mo. Les index
# (dists/) ne conviennent pas, un miroir lent sur pool/ les sert vite.
probe=pool/main/i/icu/libicu74_74.2-1ubuntu3_amd64.deb
min_speed=$((512 * 1024)) # octets par seconde
fallback=http://archive.ubuntu.com/ubuntu/

if [ ! -f "$list" ]; then
  echo "$list absent : miroirs apt inchangés"
  exit 0
fi

# Débit moyen en octets/s sur 5 s au plus ; 0 si le miroir ne sert pas le fichier.
speed() {
  curl -s -o /dev/null --connect-timeout 5 --max-time 5 \
    -w '%{http_code} %{speed_download}\n' "$1$probe" 2> /dev/null |
    awk '{ print ($1 == 200) ? int($2) : 0 }' || true
}

first_mirror() {
  awk '$1 ~ /^https?:\/\// { print $1; exit }' <<< "$1"
}

current=$(first_mirror "$(cat "$list")")
if [ -z "$current" ]; then
  echo "Aucun miroir dans $list : miroirs apt inchangés"
  exit 0
fi

current_speed=$(speed "$current")
echo "Miroir apt du runner : $current ($((${current_speed:-0} / 1024)) ko/s)"
if [ "${current_speed:-0}" -ge "$min_speed" ]; then
  exit 0
fi

kept=$(grep -vF "$current" "$list" || true)
next=$(first_mirror "$kept")
if [ -z "$next" ]; then
  kept=$(printf '%s\tpriority:1' "$fallback")
  next=$fallback
fi

next_speed=$(speed "$next")
echo "Miroir suivant : $next ($((${next_speed:-0} / 1024)) ko/s)"
if [ "${next_speed:-0}" -le "${current_speed:-0}" ]; then
  echo "Le miroir suivant ne fait pas mieux : miroirs apt inchangés"
  exit 0
fi

echo "::warning::Miroir apt lent ($current, $((${current_speed:-0} / 1024)) ko/s) : retiré au profit de $next"
if [ -w "$list" ]; then
  printf '%s\n' "$kept" > "$list"
else
  printf '%s\n' "$kept" | sudo tee "$list" > /dev/null
fi
cat "$list"
