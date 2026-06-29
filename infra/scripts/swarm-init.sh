#!/usr/bin/env bash
set -euo pipefail

# ── Prerequisites ──────────────────────────────────────────────────────────────
command -v docker  >/dev/null || { echo "ERROR: docker not found"; exit 1; }
command -v trivy   >/dev/null || { echo "INFO: install trivy: apt install trivy"; }
command -v shellcheck >/dev/null || { echo "INFO: install shellcheck: apt install shellcheck"; }

# ── LUKS setup (manual — requires interactive passphrase) ──────────────────────
cat <<'LUKS'
MANUAL STEPS — run these on the VPS before proceeding:
  cryptsetup luksFormat /dev/sdb
  cryptsetup open /dev/sdb syntheo_data
  mkfs.ext4 /dev/mapper/syntheo_data
  mount /dev/mapper/syntheo_data /mnt/syntheo_data
  mkdir -p /mnt/syntheo_data/{postgres,vault,backups}
  echo "syntheo_data /dev/sdb none luks" >> /etc/crypttab
Press ENTER when LUKS is done, or Ctrl-C to abort.
LUKS
read -r

# ── Docker Swarm ───────────────────────────────────────────────────────────────
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active; then
  docker swarm init
  echo "Swarm initialized."
else
  echo "Swarm already active — skipping."
fi

# ── Overlay networks ───────────────────────────────────────────────────────────
for net in frontend_net data_net vault_net obs_net; do
  if ! docker network ls --format '{{.Name}}' | grep -q "^${net}$"; then
    docker network create --driver overlay --attachable "${net}"
    echo "Created network: ${net}"
  else
    echo "Network exists: ${net}"
  fi
done

# ── Backup cron ───────────────────────────────────────────────────────────────
CRON_LINE="0 2 * * * $(pwd)/infra/scripts/backup.sh >> /var/log/syntheo-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "backup.sh" || true; echo "${CRON_LINE}" ) | crontab -
echo "Backup cron installed: daily at 02:00"

echo "swarm-init complete."
