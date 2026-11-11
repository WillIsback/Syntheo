#!/usr/bin/env bash
# Runners GitHub (Azure) : le DNS fourni par Azure ne résout pas toujours
# archive.ubuntu.com, security.ubuntu.com ni azure.archive.ubuntu.com. apt
# boucle alors jusqu'au délai du job (release v0.7.2 annulée après 90 min,
# runs 42936623634 et 43041814769). On impose des serveurs publics à
# systemd-resolved, globalement et sur l'interface par défaut (le serveur
# Azure de l'interface y passerait sinon en premier), puis on vérifie.
set -euo pipefail

servers=(1.1.1.1 9.9.9.9)

if ! command -v resolvectl > /dev/null; then
  echo "resolvectl absent : DNS du runner inchangé"
  exit 0
fi

sudo mkdir -p /etc/systemd/resolved.conf.d
printf '[Resolve]\nDNS=%s\n' "${servers[*]}" |
  sudo tee /etc/systemd/resolved.conf.d/90-public-dns.conf > /dev/null
sudo systemctl restart systemd-resolved

iface=$(ip -o route show default | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')
if [ -n "$iface" ]; then
  sudo resolvectl dns "$iface" "${servers[@]}"
  sudo resolvectl domain "$iface" '~.'
fi
sudo resolvectl flush-caches

resolvectl dns
for host in azure.archive.ubuntu.com archive.ubuntu.com security.ubuntu.com; do
  getent ahosts "$host" | awk -v h="$host" 'NR == 1 { print h, $1 }' || echo "$host : non résolu"
done
