#!/usr/bin/env bash
set -euo pipefail

: "${VAULT_ADDR:=https://127.0.0.1:8200}"
export VAULT_ADDR
export VAULT_SKIP_VERIFY=true   # self-signed cert from swarm-init.sh

BACKUP_CREDS_DIR=/mnt/syntheo_data/vault/backup

# ── Wait for Vault to be ready ─────────────────────────────────────────────────
echo "Waiting for Vault..."
until curl -sk -o /dev/null "${VAULT_ADDR}/v1/sys/health"; do sleep 2; done

# ── Initialize (skip if already done) ─────────────────────────────────────────
STATUS=$(curl -sk "${VAULT_ADDR}/v1/sys/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print('sealed' if d.get('sealed') else ('uninitialized' if not d.get('initialized') else 'ready'))")

if [ "${STATUS}" = "uninitialized" ]; then
  INIT=$(vault operator init -key-shares=1 -key-threshold=1 -format=json)
  UNSEAL_KEY=$(echo "${INIT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['unseal_keys_b64'][0])")
  ROOT_TOKEN=$(echo "${INIT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['root_token'])")
  echo ""
  echo "════════════════════════════════════════════════"
  echo "SAVE THESE — shown only once:"
  echo "  Unseal key : ${UNSEAL_KEY}"
  echo "  Root token : ${ROOT_TOKEN}"
  echo "════════════════════════════════════════════════"
  vault operator unseal "${UNSEAL_KEY}"
  export VAULT_TOKEN="${ROOT_TOKEN}"
else
  echo "Vault already initialized. Enter unseal key if sealed:"
  vault operator unseal
  echo "Enter root token to continue setup:"
  read -rs VAULT_TOKEN
  export VAULT_TOKEN
fi

# ── KV secrets engine ──────────────────────────────────────────────────────────
vault secrets enable -path=secret kv-v2 2>/dev/null || echo "KV already enabled"

# ── AppRole auth method ────────────────────────────────────────────────────────
vault auth enable approle 2>/dev/null || echo "AppRole already enabled"

# ── Policies — container services ─────────────────────────────────────────────
for service in postgres keycloak mlflow grafana traefik; do
vault policy write "${service}-policy" - <<POLICY
path "secret/data/syntheo/${service}" {
  capabilities = ["read"]
}
POLICY
done

# ── Policy — backup (host cron, reads GPG passphrase) ─────────────────────────
vault policy write "backup-policy" - <<POLICY
path "secret/data/syntheo/backup" {
  capabilities = ["read"]
}
POLICY

# ── AppRole roles + Docker Swarm secrets (container services) ─────────────────
for service in postgres keycloak mlflow grafana traefik; do
  vault write "auth/approle/role/${service}-role" \
    secret_id_ttl=0 \
    token_ttl=1h \
    token_max_ttl=4h \
    policies="${service}-policy"

  ROLE_ID=$(vault read -field=role_id "auth/approle/role/${service}-role/role-id")
  echo "${ROLE_ID}" | docker secret create "vault_${service}_role_id" - 2>/dev/null \
    || echo "Docker secret vault_${service}_role_id already exists"

  if ! docker secret inspect "vault_${service}_secret_id" >/dev/null 2>&1; then
    SECRET_ID=$(vault write -field=secret_id -f "auth/approle/role/${service}-role/secret-id")
    echo "${SECRET_ID}" | docker secret create "vault_${service}_secret_id" -
  else
    echo "Docker secret vault_${service}_secret_id already exists — skipping secret_id generation"
  fi

  echo "AppRole created for ${service}"
done

# ── AppRole — backup (credentials stored on LUKS volume, not Docker secrets) ──
vault write "auth/approle/role/backup-role" \
  secret_id_ttl=0 \
  token_ttl=1h \
  token_max_ttl=4h \
  policies="backup-policy"

if [ ! -f "${BACKUP_CREDS_DIR}/role_id" ]; then
  vault read -field=role_id "auth/approle/role/backup-role/role-id" \
    > "${BACKUP_CREDS_DIR}/role_id"
  chmod 600 "${BACKUP_CREDS_DIR}/role_id"
fi
if [ ! -f "${BACKUP_CREDS_DIR}/secret_id" ]; then
  vault write -field=secret_id -f "auth/approle/role/backup-role/secret-id" \
    > "${BACKUP_CREDS_DIR}/secret_id"
  chmod 600 "${BACKUP_CREDS_DIR}/secret_id"
fi
echo "Backup AppRole creds written to ${BACKUP_CREDS_DIR}/"

echo ""
echo "Next step — provision secrets in Vault (run once per deploy):"
echo "  vault kv put secret/syntheo/postgres username=syntheo password=<pw> keycloak_db_password=<pw> mlflow_db_password=<pw>"
echo "  vault kv put secret/syntheo/keycloak admin_user=admin admin_password=<pw> db_password=<keycloak_pw>"
echo "  vault kv put secret/syntheo/mlflow db_password=<mlflow_pw>"
echo "  vault kv put secret/syntheo/grafana admin_password=<pw>"
echo "  vault kv put secret/syntheo/traefik bouncer_key=<key> dashboard_htpasswd=<htpasswd>"
echo "  vault kv put secret/syntheo/backup gpg_passphrase=<passphrase>"
echo ""
echo "vault-init complete."
