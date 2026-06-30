#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/mnt/syntheo_data/backups
BACKUP_FILE="${BACKUP_DIR}/syntheo_latest.sql.gpg"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
POSTGRES_DB="${POSTGRES_DB:-syntheo_db}"
LOG_PREFIX="[syntheo-backup $(date -u +%Y-%m-%dT%H:%M:%SZ)]"

# ── Vault token via AppRole ────────────────────────────────────────────────────
ROLE_ID=$(cat /run/secrets/vault_backup_role_id   2>/dev/null || echo "")
SECRET_ID=$(cat /run/secrets/vault_backup_secret_id 2>/dev/null || echo "")

if [ -z "${ROLE_ID}" ] || [ -z "${SECRET_ID}" ]; then
  echo "${LOG_PREFIX} ERROR: Vault AppRole credentials not found at /run/secrets/" >&2
  exit 1
fi

VAULT_TOKEN=$(curl -sf "${VAULT_ADDR}/v1/auth/approle/login" \
  -d "{\"role_id\":\"${ROLE_ID}\",\"secret_id\":\"${SECRET_ID}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['auth']['client_token'])")

GPG_PASSPHRASE=$(curl -sf -H "X-Vault-Token: ${VAULT_TOKEN}" \
  "${VAULT_ADDR}/v1/secret/data/syntheo/backup" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['data']['gpg_passphrase'])")

mkdir -p "${BACKUP_DIR}"

# ── Remove partial file on any failure ────────────────────────────────────────
trap 'rm -f "${BACKUP_FILE}"' ERR

echo "${LOG_PREFIX} Starting backup of ${POSTGRES_DB}..."
pg_dump -h postgres -U "${POSTGRES_USER:-syntheo}" "${POSTGRES_DB}" \
  | gpg --batch --yes --symmetric --passphrase-fd 3 \
  > "${BACKUP_FILE}" \
  3<<< "${GPG_PASSPHRASE}"

trap - ERR
echo "${LOG_PREFIX} Backup written to ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"
