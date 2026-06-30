#!/usr/bin/env bash
set -euo pipefail

# ── Check CrowdSec is running ──────────────────────────────────────────────────
systemctl is-active --quiet crowdsec || { echo "ERROR: crowdsec not running"; exit 1; }

# ── Detect Docker bridge IP ────────────────────────────────────────────────────
DOCKER_BRIDGE_IP=$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || echo "172.17.0.1")
echo "Docker bridge IP: ${DOCKER_BRIDGE_IP}"

# ── Configure LAPI to listen on Docker bridge only (not 0.0.0.0) ──────────────
CROWDSEC_CFG=/etc/crowdsec/config.yaml
if grep -qE "listen_uri: (0\.0\.0\.0|127\.0\.0\.1):8080" "${CROWDSEC_CFG}"; then
  sed -i "s|listen_uri: .*:8080|listen_uri: ${DOCKER_BRIDGE_IP}:8080|" "${CROWDSEC_CFG}"
  echo "LAPI now listens on ${DOCKER_BRIDGE_IP}:8080"
else
  echo "LAPI listen_uri already updated — skipping"
fi

# ── Configure AppSec listener on Docker bridge only ───────────────────────────
APPSEC_CFG=/etc/crowdsec/acquis.d/appsec.yaml
mkdir -p "$(dirname "${APPSEC_CFG}")"
if [ ! -f "${APPSEC_CFG}" ]; then
cat > "${APPSEC_CFG}" <<YAML
listen_addr: ${DOCKER_BRIDGE_IP}:7422
appsec_config: crowdsecurity/virtual-patching
name: appsec
source: appsec
labels:
  type: appsec
YAML
  echo "AppSec acquisition config created (${DOCKER_BRIDGE_IP}:7422)"
else
  # Update existing config if it binds to wrong address
  if grep -qE "listen_addr: (0\.0\.0\.0|127\.0\.0\.1):7422" "${APPSEC_CFG}"; then
    sed -i "s|listen_addr: .*:7422|listen_addr: ${DOCKER_BRIDGE_IP}:7422|" "${APPSEC_CFG}"
    echo "AppSec listen_addr updated to ${DOCKER_BRIDGE_IP}:7422"
  fi
fi

# ── Firewall rules — block public access to LAPI and AppSec ──────────────────
if command -v ufw >/dev/null 2>&1; then
  # Interface-agnostic deny — blocks all interfaces, not just eth0 (OVH may use ens3/enp1s0)
  ufw deny to any port 8080 comment "block public crowdsec-lapi" 2>/dev/null || true
  ufw deny to any port 7422 comment "block public crowdsec-appsec" 2>/dev/null || true
  echo "ufw rules added for ports 8080 and 7422"
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
