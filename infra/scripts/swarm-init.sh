#!/usr/bin/env bash
set -euo pipefail

# ── Prerequisites ──────────────────────────────────────────────────────────────
command -v docker    >/dev/null || { echo "ERROR: docker not found"; exit 1; }
command -v openssl   >/dev/null || { echo "ERROR: openssl not found (apt install openssl)"; exit 1; }
command -v trivy     >/dev/null || { echo "INFO: install trivy: apt install trivy"; }
command -v shellcheck >/dev/null || { echo "INFO: install shellcheck: apt install shellcheck"; }

# ── LUKS setup (manual — requires interactive passphrase) ──────────────────────
cat <<'LUKS'
MANUAL STEPS — run these on the VPS before proceeding:
  cryptsetup luksFormat /dev/sdb
  cryptsetup open /dev/sdb syntheo_data
  mkfs.ext4 /dev/mapper/syntheo_data
  mount /dev/mapper/syntheo_data /mnt/syntheo_data
  echo "syntheo_data /dev/sdb none luks" >> /etc/crypttab
Press ENTER when LUKS is done, or Ctrl-C to abort.
LUKS
read -r

# ── LUKS directory structure ────────────────────────────────────────────────────
mkdir -p /mnt/syntheo_data/{vault/data,vault/tls,vault/backup,postgres,backups}
mkdir -p /mnt/syntheo_data/obs/{loki,prometheus,tempo}
mkdir -p /mnt/syntheo_data/mlflow/artifacts
# Observability services run as non-root — world-writable within LUKS-encrypted volume
chmod 777 /mnt/syntheo_data/obs/loki \
           /mnt/syntheo_data/obs/prometheus \
           /mnt/syntheo_data/obs/tempo \
           /mnt/syntheo_data/mlflow/artifacts
# Backup creds dir: root-only (host cron runs as root)
chmod 700 /mnt/syntheo_data/vault/backup
echo "LUKS directory structure created."

# ── Vault TLS self-signed certificate ─────────────────────────────────────────
TLS_DIR=/mnt/syntheo_data/vault/tls
if [ ! -f "${TLS_DIR}/vault.crt" ]; then
  openssl req -newkey rsa:4096 -nodes \
    -keyout "${TLS_DIR}/vault.key" \
    -x509 -days 3650 \
    -subj "/CN=vault" \
    -addext "subjectAltName=DNS:vault,DNS:localhost,IP:127.0.0.1" \
    -out "${TLS_DIR}/vault.crt" 2>/dev/null
  chmod 600 "${TLS_DIR}/vault.key"
  chmod 644 "${TLS_DIR}/vault.crt"
  echo "Vault TLS cert generated (4096-bit RSA, 10 year, SAN: vault/localhost/127.0.0.1)"
else
  echo "Vault TLS cert already exists — skipping"
fi

# ── Docker Swarm ───────────────────────────────────────────────────────────────
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active; then
  docker swarm init
  echo "Swarm initialized."
else
  echo "Swarm already active — skipping."
fi

# ── Overlay networks (IPSec-encrypted) ────────────────────────────────────────
for net in frontend_net data_net vault_net obs_net; do
  if ! docker network ls --format '{{.Name}}' | grep -q "^${net}$"; then
    docker network create --driver overlay --attachable --opt encrypted "${net}"
    echo "Created encrypted network: ${net}"
  else
    echo "Network exists: ${net}"
  fi
done

# ── Backup cron (host-level, reads AppRole creds from LUKS volume) ───────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRON_LINE="0 2 * * * ${SCRIPT_DIR}/backup.sh >> /var/log/syntheo-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "backup.sh" || true; echo "${CRON_LINE}" ) | crontab -
echo "Backup cron installed: daily at 02:00"

echo "swarm-init complete."
