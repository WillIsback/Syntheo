#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "${SCRIPT_DIR}")"
VERSION="${VERSION:-latest}"

# ── 0. Trivy pre-flight ────────────────────────────────────────────────────────
command -v trivy >/dev/null || { echo "ERROR: trivy not installed (apt install trivy)"; exit 1; }

IMAGES=(
  "traefik:v3.1"
  "hashicorp/vault:1.17.2"
  "postgres:16-alpine"
  "quay.io/keycloak/keycloak:24.0"
  "otel/opentelemetry-collector-contrib:0.103.0"
  "grafana/loki:3.0.0"
  "prom/prometheus:v2.53.0"
  "grafana/tempo:2.5.0"
  "ghcr.io/mlflow/mlflow:v2.14.1"
  "grafana/grafana:11.1.0"
)

echo "── Trivy pre-flight ──────────────────────────────────────────────────────"
FAIL=0
for image in "${IMAGES[@]}"; do
  echo -n "Scanning ${image}... "
  if trivy image --exit-code 1 --severity CRITICAL --quiet "${image}" 2>/dev/null; then
    echo "OK"
  else
    echo "CRITICAL CVE FOUND"
    FAIL=1
  fi
done

if [ "${FAIL}" -eq 1 ]; then
  echo "ERROR: Trivy found CRITICAL vulnerabilities. Deploy aborted."
  echo "       Check Renovate PRs for patched digests, or pin to a safe version."
  exit 1
fi
echo "Trivy: all images clean."

# ── Load env ──────────────────────────────────────────────────────────────────
if [ -f "${INFRA_DIR}/../.env" ]; then
  set -a; source "${INFRA_DIR}/../.env"; set +a
else
  echo "WARNING: .env not found — using shell environment"
fi

cd "${INFRA_DIR}"

# ── 1. Core (Traefik + Vault) ─────────────────────────────────────────────────
echo "── Deploying core stack ─────────────────────────────────────────────────"
docker stack deploy -c stacks/core.yml syntheo-core --with-registry-auth

echo "Waiting for Vault to be ready..."
until docker run --rm --network vault_net curlimages/curl:8.8.0 \
  curl -sf http://vault:8200/v1/sys/health >/dev/null 2>&1; do sleep 3; done

# ── 2. Data (PostgreSQL + Keycloak) ──────────────────────────────────────────
echo "── Deploying data stack ─────────────────────────────────────────────────"
docker stack deploy -c stacks/data.yml syntheo-data --with-registry-auth

echo "Waiting for PostgreSQL..."
until docker run --rm --network data_net postgres:16-alpine \
  pg_isready -h postgres -U syntheo >/dev/null 2>&1; do sleep 3; done

# ── 3. Observability ──────────────────────────────────────────────────────────
echo "── Deploying obs stack ──────────────────────────────────────────────────"
docker stack deploy -c stacks/obs.yml syntheo-obs --with-registry-auth

# ── 4. App ────────────────────────────────────────────────────────────────────
echo "── Deploying app stack ──────────────────────────────────────────────────"
docker stack deploy -c stacks/app.yml syntheo-app --with-registry-auth

echo ""
echo "All stacks deployed. Check status with:"
echo "  docker stack ls"
echo "  docker service ls"
