#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/mnt/syntheo_data/backups
BACKUP_FILE="${BACKUP_DIR}/syntheo_latest.sql.gpg"
VAULT_ADDR="${VAULT_ADDR:-https://127.0.0.1:8200}"
POSTGRES_DB="${POSTGRES_DB:-syntheo_db}"
POSTGRES_USER="${POSTGRES_USER:-syntheo}"
BACKUP_CREDS_DIR=/mnt/syntheo_data/vault/backup
LOG_PREFIX="[syntheo-backup $(date -u +%Y-%m-%dT%H:%M:%SZ)]"

# ── Vault token via AppRole (creds on LUKS volume) ────────────────────────────
ROLE_ID=$(cat "${BACKUP_CREDS_DIR}/role_id"   2>/dev/null || echo "")
SECRET_ID=$(cat "${BACKUP_CREDS_DIR}/secret_id" 2>/dev/null || echo "")

if [ -z "${ROLE_ID}" ] || [ -z "${SECRET_ID}" ]; then
  echo "${LOG_PREFIX} ERROR: Backup AppRole creds not found at ${BACKUP_CREDS_DIR}/" >&2
  echo "${LOG_PREFIX}        Run vault-init.sh to provision backup AppRole." >&2
  exit 1
fi

VAULT_TOKEN=$(curl -sk "${VAULT_ADDR}/v1/auth/approle/login" \
  -d "{\"role_id\":\"${ROLE_ID}\",\"secret_id\":\"${SECRET_ID}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['auth']['client_token'])")

GPG_PASSPHRASE=$(curl -sk -H "X-Vault-Token: ${VAULT_TOKEN}" \
  "${VAULT_ADDR}/v1/secret/data/syntheo/backup" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['data']['gpg_passphrase'])")

mkdir -p "${BACKUP_DIR}"

# ── Find the running postgres container ───────────────────────────────────────
PG_CONTAINER=$(docker ps -q --filter 'name=syntheo-data_postgres' | head -1)
if [ -z "${PG_CONTAINER}" ]; then
  echo "${LOG_PREFIX} ERROR: postgres container not running" >&2
  exit 1
fi

# ── Remove partial file on any failure ────────────────────────────────────────
trap 'rm -f "${BACKUP_FILE}"' ERR

echo "${LOG_PREFIX} Starting backup of ${POSTGRES_DB}..."
docker exec "${PG_CONTAINER}" \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gpg --batch --yes --symmetric --passphrase-fd 3 \
  > "${BACKUP_FILE}" \
  3<<< "${GPG_PASSPHRASE}"

trap - ERR
echo "${LOG_PREFIX} Backup written to ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"
