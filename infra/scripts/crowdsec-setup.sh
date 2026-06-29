#!/usr/bin/env bash
set -euo pipefail

# ── Check CrowdSec is running ──────────────────────────────────────────────────
systemctl is-active --quiet crowdsec || { echo "ERROR: crowdsec not running"; exit 1; }

# ── Configure LAPI to listen on all interfaces (Docker can reach it) ───────────
CROWDSEC_CFG=/etc/crowdsec/config.yaml
if grep -q "listen_uri: 127.0.0.1:8080" "${CROWDSEC_CFG}"; then
  sed -i 's/listen_uri: 127.0.0.1:8080/listen_uri: 0.0.0.0:8080/' "${CROWDSEC_CFG}"
  echo "LAPI now listens on 0.0.0.0:8080"
else
  echo "LAPI listen_uri already updated — skipping"
fi

# ── Configure AppSec listener ──────────────────────────────────────────────────
APPSEC_CFG=/etc/crowdsec/acquis.d/appsec.yaml
mkdir -p "$(dirname "${APPSEC_CFG}")"
if [ ! -f "${APPSEC_CFG}" ]; then
cat > "${APPSEC_CFG}" <<'YAML'
listen_addr: 0.0.0.0:7422
appsec_config: crowdsecurity/virtual-patching
name: appsec
source: appsec
labels:
  type: appsec
YAML
  echo "AppSec acquisition config created"
fi

# ── Install hub collections ────────────────────────────────────────────────────
cscli collections install \
  crowdsecurity/traefik \
  crowdsecurity/http-cve \
  crowdsecurity/appsec-virtual-patching \
  --force

# ── Register Traefik bouncer key ───────────────────────────────────────────────
if cscli bouncers list -o json | grep -qE '"name":\s*"traefik"'; then
  echo "INFO: Traefik bouncer already registered — delete it first to regenerate:"
  echo "  cscli bouncers delete traefik"
else
  BOUNCER_KEY=$(cscli bouncers add traefik -o raw)
  echo ""
  echo "════════════════════════════════════════════════"
  echo "Traefik bouncer key (store in Vault):"
  echo "  vault kv put secret/syntheo/traefik bouncer_key=${BOUNCER_KEY}"
  echo "════════════════════════════════════════════════"
fi

# ── Restart and validate ───────────────────────────────────────────────────────
systemctl restart crowdsec
sleep 2
cscli bouncers list
echo "crowdsec-setup complete."
