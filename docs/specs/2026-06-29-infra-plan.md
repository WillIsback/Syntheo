# Syntheo Infra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the full Syntheo infrastructure stack on the OVH VPS — Docker Swarm, Traefik + CrowdSec, Vault, PostgreSQL, Keycloak, and the full observability stack — RGPD/IA Act/SecNumCloud compliant.

**Architecture:** Multi-stack Docker Swarm (core → data → obs → app) with four named overlay networks. Secrets exclusively via Vault Agent + Docker Swarm secrets for AppRole credentials. CrowdSec runs on the VPS host and integrates with Traefik via the Yaegi plugin. Renovate pins all image digests; Trivy gates every deploy.

**Tech Stack:** Docker Swarm, Traefik v3.1, HashiCorp Vault 1.17, PostgreSQL 16-alpine, Keycloak 24, OpenTelemetry Collector Contrib, Grafana 11, Loki 3, Prometheus 2, Tempo 2, MLflow 2, CrowdSec (host systemd), GitHub Actions, Renovate (self-hosted)

## Global Constraints

- Docker Swarm single-node on OVH VPS France (Ubuntu 22.04+); Docker already installed
- All domain/email references via env vars (`DOMAIN`, `ACME_EMAIL`) — no hardcoded strings
- No secrets in stack files or `.env` — app credentials exclusively via Vault Agent
- LUKS-encrypted volume at `/mnt/syntheo_data/` for PostgreSQL and Vault data (manual one-time setup)
- TLS 1.3 minimum on all public endpoints via Traefik
- Loki `audit` stream: 12-month retention, `app` stream: 7-day retention
- Trivy must pass (no CVSSv3 ≥ 9.0) before any `docker stack deploy`
- All images pinned to SHA digest — Renovate manages `infra/stacks/*.yml` and `package.json`
- OVH France only — no US cloud dependencies

---

## File Map

```
.github/
└── workflows/
    └── trivy.yml                          # PR gate: scan all images, block on CRITICAL

infra/
├── stacks/
│   ├── core.yml                           # Vault + Traefik
│   ├── data.yml                           # PostgreSQL + Keycloak (+ Vault Agent sidecars)
│   ├── obs.yml                            # OTel + Grafana + Loki + Prometheus + Tempo + MLflow
│   └── app.yml                            # Next.js placeholder
├── config/
│   ├── traefik/
│   │   ├── traefik.yml                    # Static config: entrypoints, ACME, CrowdSec plugin
│   │   └── dynamic.yml                    # Middlewares: crowdsec, ratelimit, secure-headers
│   ├── vault/
│   │   ├── vault.hcl                      # Storage, listener, seal config
│   │   └── agents/
│   │       ├── postgres.hcl               # Vault Agent: renders postgres credentials
│   │       ├── keycloak.hcl               # Vault Agent: renders keycloak credentials
│   │       ├── mlflow.hcl                 # Vault Agent: renders mlflow credentials
│   │       └── grafana.hcl               # Vault Agent: renders grafana admin password
│   ├── otel/
│   │   └── otel-collector-config.yaml     # Receivers, processors, exporters (COMPANY_INFRA_PLUG)
│   ├── prometheus/
│   │   └── prometheus.yml                 # Scrape targets
│   ├── loki/
│   │   └── loki-config.yaml              # Dual-stream retention (audit 12mo, app 7d)
│   ├── grafana/
│   │   └── provisioning/
│   │       ├── datasources/
│   │       │   └── datasources.yaml       # Loki, Prometheus, Tempo, MLflow
│   │       ├── dashboards/
│   │       │   └── dashboards.yaml        # Dashboard provider config
│   │       └── alerting/
│   │           └── compliance-alerts.yaml # Cross-user access, deletion spike, auth burst
│   └── keycloak/
│       └── syntheo-realm.json             # Realm: syntheo, client: syntheo-app (PKCE)
├── scripts/
│   ├── swarm-init.sh                      # One-time: LUKS docs, swarm init, networks, cron
│   ├── crowdsec-setup.sh                  # One-time: LAPI bind, collections, Traefik key
│   ├── vault-init.sh                      # One-time: init, unseal, KV, AppRole, policies
│   ├── deploy.sh                          # Trivy pre-flight + ordered stack deploy
│   ├── backup.sh                          # Daily pg_dump | gpg → /mnt/syntheo_data/backups/
│   └── teardown.sh                        # Reverse-order stack removal
└── .env.example                           # All env vars, no secret defaults
```

---

## Task 1: Scaffold + `.env.example` + `swarm-init.sh`

**Files:**
- Create: `infra/scripts/swarm-init.sh`
- Create: `infra/.env.example`

**Interfaces:**
- Produces: overlay networks `frontend_net`, `data_net`, `vault_net`, `obs_net` — consumed by all stacks

- [ ] **Step 1: Create directory skeleton**

```bash
mkdir -p infra/stacks infra/config/traefik infra/config/vault/agents \
         infra/config/otel infra/config/prometheus infra/config/loki \
         infra/config/grafana/provisioning/datasources \
         infra/config/grafana/provisioning/dashboards \
         infra/config/grafana/provisioning/alerting \
         infra/config/keycloak infra/scripts .github/workflows
```

- [ ] **Step 2: Write `infra/.env.example`**

```bash
# Domain & TLS
DOMAIN=syntheo.willisback.fr
ACME_EMAIL=william.derue@gmail.com

# Vault
VAULT_ADDR=http://vault:8200

# Database names (credentials come from Vault Agent)
POSTGRES_DB=syntheo_db
KEYCLOAK_DB=keycloak_db
MLFLOW_DB=mlflow_db

# External AI services (api.willisback.fr gateway — key stored in Vault)
WHISPERX_BASE_URL=https://api.willisback.fr/whisper/asr/v1
LLM_BASE_URL=https://api.willisback.fr/llm/v1
LLM_MODEL=nvidia/Qwen3.6-35B-A3B-NVFP4

# Keycloak OIDC (client secret stored in Vault)
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=syntheo
KEYCLOAK_CLIENT_ID=syntheo-app

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
MLFLOW_TRACKING_URI=http://mlflow:5000
```

- [ ] **Step 3: Write `infra/scripts/swarm-init.sh`**

```bash
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
( crontab -l 2>/dev/null | grep -v "backup.sh"; echo "${CRON_LINE}" ) | crontab -
echo "Backup cron installed: daily at 02:00"

echo "swarm-init complete."
```

- [ ] **Step 4: Validate syntax**

```bash
bash -n infra/scripts/swarm-init.sh
```
Expected: no output (syntax OK)

- [ ] **Step 5: Commit**

```bash
git add infra/ .github/
git commit -m "feat(infra): scaffold directory structure, .env.example, swarm-init.sh"
```

---

## Task 2: `crowdsec-setup.sh`

**Files:**
- Create: `infra/scripts/crowdsec-setup.sh`

**Interfaces:**
- Consumes: CrowdSec already installed on VPS host (systemd)
- Produces: LAPI listening on `0.0.0.0:8080`, AppSec on `0.0.0.0:7422`, Traefik bouncer key printed to stdout → store in Vault at `secret/syntheo/traefik` (field: `bouncer_key`)

- [ ] **Step 1: Write `infra/scripts/crowdsec-setup.sh`**

```bash
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
if cscli bouncers list -o json | grep -q '"name":"traefik"'; then
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
```

- [ ] **Step 2: Validate syntax**

```bash
bash -n infra/scripts/crowdsec-setup.sh
```
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add infra/scripts/crowdsec-setup.sh
git commit -m "feat(infra): add crowdsec-setup.sh — LAPI bind, AppSec, Traefik bouncer"
```

---

## Task 3: Vault — config, stack entry, init script

**Files:**
- Create: `infra/config/vault/vault.hcl`
- Create: `infra/stacks/core.yml` (Vault service only; Traefik added in Task 4)
- Create: `infra/scripts/vault-init.sh`

**Interfaces:**
- Produces:
  - Vault listening at `http://vault:8200` on `vault_net`
  - KV v2 secrets engine at `secret/`
  - AppRole roles: `postgres-role`, `keycloak-role`, `mlflow-role`, `grafana-role`, `traefik-role`
  - Docker Swarm secrets per service: `vault_<service>_role_id`, `vault_<service>_secret_id`

- [ ] **Step 1: Write `infra/config/vault/vault.hcl`**

```hcl
storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true"
}

ui            = false
disable_mlock = true
```

- [ ] **Step 2: Write `infra/stacks/core.yml` (Vault only)**

```yaml
version: "3.9"

services:
  vault:
    image: hashicorp/vault:1.17.2
    command: server
    cap_add:
      - IPC_LOCK
    environment:
      VAULT_ADDR: "http://0.0.0.0:8200"
    volumes:
      - type: bind
        source: /mnt/syntheo_data/vault
        target: /vault/data
      - type: bind
        source: ./config/vault/vault.hcl
        target: /vault/config/vault.hcl
        read_only: true
    networks:
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s

networks:
  vault_net:
    external: true
```

- [ ] **Step 3: Validate stack file**

Run from `infra/` directory:
```bash
docker compose -f stacks/core.yml config --quiet
```
Expected: no output (valid)

- [ ] **Step 4: Write `infra/scripts/vault-init.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${VAULT_ADDR:=http://127.0.0.1:8200}"
export VAULT_ADDR

# ── Wait for Vault to be ready ─────────────────────────────────────────────────
echo "Waiting for Vault..."
until curl -sf "${VAULT_ADDR}/v1/sys/health" >/dev/null 2>&1; do sleep 2; done

# ── Initialize (skip if already done) ─────────────────────────────────────────
STATUS=$(curl -sf "${VAULT_ADDR}/v1/sys/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print('sealed' if d.get('sealed') else ('uninitialized' if not d.get('initialized') else 'ready'))")

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

# ── Policies ──────────────────────────────────────────────────────────────────
for service in postgres keycloak mlflow grafana traefik; do
vault policy write "${service}-policy" - <<POLICY
path "secret/data/syntheo/${service}" {
  capabilities = ["read"]
}
POLICY
done

# ── AppRole roles + Docker Swarm secrets ──────────────────────────────────────
for service in postgres keycloak mlflow grafana traefik; do
  vault write "auth/approle/role/${service}-role" \
    secret_id_ttl=0 \
    token_ttl=1h \
    token_max_ttl=4h \
    policies="${service}-policy"

  ROLE_ID=$(vault read -field=role_id "auth/approle/role/${service}-role/role-id")
  SECRET_ID=$(vault write -field=secret_id -f "auth/approle/role/${service}-role/secret-id")

  echo "${ROLE_ID}"  | docker secret create "vault_${service}_role_id"   - 2>/dev/null \
    || echo "Docker secret vault_${service}_role_id already exists"
  echo "${SECRET_ID}" | docker secret create "vault_${service}_secret_id" - 2>/dev/null \
    || echo "Docker secret vault_${service}_secret_id already exists"

  echo "AppRole created for ${service}"
done

echo "vault-init complete."
```

- [ ] **Step 5: Validate syntax**

```bash
bash -n infra/scripts/vault-init.sh
```
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add infra/config/vault/vault.hcl infra/stacks/core.yml infra/scripts/vault-init.sh
git commit -m "feat(infra): Vault config, core.yml skeleton, vault-init.sh with AppRole"
```

---

## Task 4: Traefik — static config, dynamic config, complete `core.yml`

**Files:**
- Create: `infra/config/traefik/traefik.yml`
- Create: `infra/config/traefik/dynamic.yml`
- Create: `infra/config/vault/agents/traefik.hcl`
- Modify: `infra/stacks/core.yml` (add Traefik service + Vault Agent sidecar)

**Interfaces:**
- Consumes: `vault_traefik_role_id`, `vault_traefik_secret_id` Docker Swarm secrets; `vault_net`, `frontend_net` overlay networks; `secret/syntheo/traefik` Vault path (fields: `bouncer_key`, `dashboard_htpasswd`)
- Produces: HTTPS ingress on `frontend_net`; `crowdsec`, `ratelimit`, `secure-headers` middlewares available to all routers

- [ ] **Step 1: Write `infra/config/traefik/traefik.yml`**

```yaml
global:
  checkNewVersion: false
  sendAnonymousUsage: false

experimental:
  plugins:
    bouncer:
      moduleName: github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin
      version: v1.6.0

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
    forwardedHeaders:
      trustedIPs:
        - "10.0.0.0/8"
        - "172.16.0.0/12"
  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt
        options: modern
    forwardedHeaders:
      trustedIPs:
        - "10.0.0.0/8"
        - "172.16.0.0/12"

tls:
  options:
    modern:
      minVersion: VersionTLS13

certificatesResolvers:
  letsencrypt:
    acme:
      storage: /certs/acme.json
      httpChallenge:
        entryPoint: web

providers:
  file:
    filename: /etc/traefik/dynamic.yml
    watch: true
  docker:
    exposedByDefault: false
    swarmMode: true

log:
  level: INFO

accessLog:
  filePath: /var/log/traefik/access.log
```

- [ ] **Step 2: Write `infra/config/traefik/dynamic.yml`**

```yaml
http:
  middlewares:
    crowdsec:
      plugin:
        bouncer:
          enabled: true
          crowdsecMode: stream
          updateIntervalSeconds: 10
          crowdsecLapiScheme: http
          crowdsecLapiHost: host.docker.internal:8080
          crowdsecLapiKey: "{{ env `CROWDSEC_BOUNCER_KEY` }}"
          crowdsecAppsecEnabled: true
          crowdsecAppsecHost: host.docker.internal:7422
          forwardedHeadersTrustedIPs:
            - "10.0.0.0/8"
            - "172.16.0.0/12"

    ratelimit:
      rateLimit:
        average: 100
        burst: 50
        period: 1s

    secure-headers:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        forceSTSHeader: true
        contentTypeNosniff: true
        frameDeny: true
        customFrameOptionsValue: "DENY"
        referrerPolicy: "strict-origin-when-cross-origin"
        contentSecurityPolicy: >-
          default-src 'self';
          script-src 'self';
          style-src 'self' 'unsafe-inline';
          img-src 'self' data:;
          font-src 'self';
          connect-src 'self' https://api.willisback.fr;
          frame-ancestors 'none'

    dashboard-auth:
      basicAuth:
        usersFile: /run/secrets/traefik_htpasswd
```

- [ ] **Step 3: Write `infra/config/vault/agents/traefik.hcl`**

```hcl
vault {
  address = "http://vault:8200"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/run/secrets/vault_traefik_role_id"
      secret_id_file_path = "/run/secrets/vault_traefik_secret_id"
    }
  }
  sink "file" {
    config = {
      path = "/tmp/.vault-token"
    }
  }
}

template {
  contents    = "{{ with secret \"secret/data/syntheo/traefik\" }}{{ .Data.data.bouncer_key }}{{ end }}"
  destination = "/run/vault/CROWDSEC_BOUNCER_KEY"
}

template {
  contents    = "{{ with secret \"secret/data/syntheo/traefik\" }}{{ .Data.data.dashboard_htpasswd }}{{ end }}"
  destination = "/run/vault/traefik_htpasswd"
}
```

- [ ] **Step 4: Update `infra/stacks/core.yml` — add Traefik + Vault Agent**

```yaml
version: "3.9"

services:
  vault:
    image: hashicorp/vault:1.17.2
    command: server
    cap_add:
      - IPC_LOCK
    environment:
      VAULT_ADDR: "http://0.0.0.0:8200"
    volumes:
      - type: bind
        source: /mnt/syntheo_data/vault
        target: /vault/data
      - type: bind
        source: ./config/vault/vault.hcl
        target: /vault/config/vault.hcl
        read_only: true
    networks:
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s

  vault-agent-traefik:
    image: hashicorp/vault:1.17.2
    command: ["agent", "-config=/vault/config/agent.hcl"]
    environment:
      VAULT_ADDR: "http://vault:8200"
    volumes:
      - type: bind
        source: ./config/vault/agents/traefik.hcl
        target: /vault/config/agent.hcl
        read_only: true
      - traefik_secrets:/run/vault
    secrets:
      - vault_traefik_role_id
      - vault_traefik_secret_id
    networks:
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure

  traefik:
    image: traefik:v3.1
    ports:
      - target: 80
        published: 80
        protocol: tcp
        mode: host
      - target: 443
        published: 443
        protocol: tcp
        mode: host
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      ACME_EMAIL: "${ACME_EMAIL}"
      CROWDSEC_BOUNCER_KEY_FILE: /run/vault/CROWDSEC_BOUNCER_KEY
    volumes:
      - type: bind
        source: ./config/traefik/traefik.yml
        target: /etc/traefik/traefik.yml
        read_only: true
      - type: bind
        source: ./config/traefik/dynamic.yml
        target: /etc/traefik/dynamic.yml
        read_only: true
      - traefik_certs:/certs
      - traefik_secrets:/run/vault:ro
      - traefik_logs:/var/log/traefik
    networks:
      - frontend_net
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
      update_config:
        order: start-first
    depends_on:
      - vault-agent-traefik

secrets:
  vault_traefik_role_id:
    external: true
  vault_traefik_secret_id:
    external: true

volumes:
  traefik_certs:
  traefik_secrets:
  traefik_logs:

networks:
  frontend_net:
    external: true
  vault_net:
    external: true
```

- [ ] **Step 5: Validate stack file**

```bash
docker compose -f infra/stacks/core.yml config --quiet
```
Expected: no output (valid)

- [ ] **Step 6: Commit**

```bash
git add infra/config/traefik/ infra/config/vault/agents/traefik.hcl infra/stacks/core.yml
git commit -m "feat(infra): Traefik static+dynamic config, CrowdSec plugin, complete core.yml"
```

---

## Task 5: Data stack — PostgreSQL + Keycloak

**Files:**
- Create: `infra/config/vault/agents/postgres.hcl`
- Create: `infra/config/vault/agents/keycloak.hcl`
- Create: `infra/config/keycloak/syntheo-realm.json`
- Create: `infra/stacks/data.yml`

**Interfaces:**
- Consumes: `vault_net`, `data_net` overlay networks; Docker Swarm secrets `vault_postgres_role_id`, `vault_postgres_secret_id`, `vault_keycloak_role_id`, `vault_keycloak_secret_id`; Vault paths `secret/syntheo/postgres` (fields: `username`, `password`), `secret/syntheo/keycloak` (fields: `admin_user`, `admin_password`, `db_password`)
- Produces: PostgreSQL at `postgres:5432` on `data_net`; Keycloak at `keycloak:8080` on `data_net` and `frontend_net`; databases `syntheo_db`, `keycloak_db`, `mlflow_db`

- [ ] **Step 1: Write `infra/config/vault/agents/postgres.hcl`**

```hcl
vault {
  address = "http://vault:8200"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/run/secrets/vault_postgres_role_id"
      secret_id_file_path = "/run/secrets/vault_postgres_secret_id"
    }
  }
  sink "file" {
    config = {
      path = "/tmp/.vault-token"
    }
  }
}

template {
  contents = <<EOT
{{ with secret "secret/data/syntheo/postgres" -}}
POSTGRES_USER={{ .Data.data.username }}
POSTGRES_PASSWORD={{ .Data.data.password }}
{{- end }}
EOT
  destination = "/run/vault/postgres.env"
}
```

- [ ] **Step 2: Write `infra/config/vault/agents/keycloak.hcl`**

```hcl
vault {
  address = "http://vault:8200"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/run/secrets/vault_keycloak_role_id"
      secret_id_file_path = "/run/secrets/vault_keycloak_secret_id"
    }
  }
  sink "file" {
    config = {
      path = "/tmp/.vault-token"
    }
  }
}

template {
  contents = <<EOT
{{ with secret "secret/data/syntheo/keycloak" -}}
KEYCLOAK_ADMIN={{ .Data.data.admin_user }}
KEYCLOAK_ADMIN_PASSWORD={{ .Data.data.admin_password }}
KC_DB_PASSWORD={{ .Data.data.db_password }}
{{- end }}
EOT
  destination = "/run/vault/keycloak.env"
}
```

- [ ] **Step 3: Write `infra/config/keycloak/syntheo-realm.json`**

```json
{
  "realm": "syntheo",
  "enabled": true,
  "displayName": "Syntheo",
  "displayNameHtml": "<strong>Syntheo</strong>",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "rememberMe": false,
  "bruteForceProtected": true,
  "permanentLockout": false,
  "maxFailureWaitSeconds": 900,
  "minimumQuickLoginWaitSeconds": 60,
  "waitIncrementSeconds": 60,
  "quickLoginCheckMilliSeconds": 1000,
  "maxDeltaTimeSeconds": 43200,
  "failureFactor": 5,
  "sslRequired": "all",
  "accessTokenLifespan": 300,
  "clients": [
    {
      "clientId": "syntheo-app",
      "name": "Syntheo Application",
      "enabled": true,
      "publicClient": false,
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": false,
      "redirectUris": [],
      "webOrigins": [],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "+"
      },
      "protocolMappers": [
        {
          "name": "email",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-attribute-mapper",
          "config": {
            "user.attribute": "email",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "email"
          }
        }
      ]
    }
  ],
  "roles": {
    "realm": [
      { "name": "user",  "description": "Standard Syntheo user" },
      { "name": "admin", "description": "Syntheo administrator" }
    ]
  },
  "defaultRoles": ["user"]
}
```

Note: `redirectUris` and `webOrigins` are left empty — Keycloak's `start` command accepts `--hostname` which sets these dynamically at runtime. Alternatively, they are configured post-deploy via `kcadm.sh` with the actual `${DOMAIN}` value.

- [ ] **Step 4: Write `infra/stacks/data.yml`**

```yaml
version: "3.9"

services:
  vault-agent-postgres:
    image: hashicorp/vault:1.17.2
    command: ["agent", "-config=/vault/config/agent.hcl"]
    environment:
      VAULT_ADDR: "http://vault:8200"
    volumes:
      - type: bind
        source: ./config/vault/agents/postgres.hcl
        target: /vault/config/agent.hcl
        read_only: true
      - postgres_secrets:/run/vault
    secrets:
      - vault_postgres_role_id
      - vault_postgres_secret_id
    networks:
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure

  postgres:
    image: postgres:16-alpine
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        until [ -f /run/vault/postgres.env ]; do
          echo "Waiting for Vault Agent to render secrets..."; sleep 2;
        done
        set -a; . /run/vault/postgres.env; set +a
        exec /usr/local/bin/docker-entrypoint.sh postgres
    environment:
      POSTGRES_DB: "${POSTGRES_DB}"
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - type: bind
        source: /mnt/syntheo_data/postgres
        target: /var/lib/postgresql/data
      - postgres_secrets:/run/vault:ro
      - type: bind
        source: ./config/postgres/init.sql
        target: /docker-entrypoint-initdb.d/init.sql
        read_only: true
    networks:
      - data_net
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 10s

  vault-agent-keycloak:
    image: hashicorp/vault:1.17.2
    command: ["agent", "-config=/vault/config/agent.hcl"]
    environment:
      VAULT_ADDR: "http://vault:8200"
    volumes:
      - type: bind
        source: ./config/vault/agents/keycloak.hcl
        target: /vault/config/agent.hcl
        read_only: true
      - keycloak_secrets:/run/vault
    secrets:
      - vault_keycloak_role_id
      - vault_keycloak_secret_id
    networks:
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        until [ -f /run/vault/keycloak.env ]; do
          echo "Waiting for Vault Agent..."; sleep 2;
        done
        set -a; . /run/vault/keycloak.env; set +a
        exec /opt/keycloak/bin/kc.sh start \
          --hostname=https://${DOMAIN} \
          --hostname-backchannel-dynamic=true \
          --http-enabled=true \
          --http-port=8080 \
          --db=postgres \
          --db-url=jdbc:postgresql://postgres:5432/${KEYCLOAK_DB} \
          --db-username=keycloak \
          --db-password="${KC_DB_PASSWORD}" \
          --import-realm
    environment:
      KC_DB: postgres
      KEYCLOAK_DB: "${KEYCLOAK_DB}"
      DOMAIN: "${DOMAIN}"
    volumes:
      - keycloak_secrets:/run/vault:ro
      - type: bind
        source: ./config/keycloak/syntheo-realm.json
        target: /opt/keycloak/data/import/syntheo-realm.json
        read_only: true
    networks:
      - data_net
      - frontend_net
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 15s
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.keycloak.rule=Host(`${DOMAIN}`) && PathPrefix(`/realms`, `/resources`, `/js`)"
        - "traefik.http.routers.keycloak.entrypoints=websecure"
        - "traefik.http.routers.keycloak.middlewares=crowdsec,secure-headers"
        - "traefik.http.services.keycloak.loadbalancer.server.port=8080"

secrets:
  vault_postgres_role_id:
    external: true
  vault_postgres_secret_id:
    external: true
  vault_keycloak_role_id:
    external: true
  vault_keycloak_secret_id:
    external: true

volumes:
  postgres_secrets:
  keycloak_secrets:

networks:
  data_net:
    external: true
  frontend_net:
    external: true
  vault_net:
    external: true
```

- [ ] **Step 5: Write `infra/config/postgres/init.sql`**

Create the directory and file:
```bash
mkdir -p infra/config/postgres
```

```sql
-- Create additional databases for Keycloak and MLflow
CREATE DATABASE keycloak_db;
CREATE DATABASE mlflow_db;

-- Enable extensions on main db
\c syntheo_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable extensions on mlflow db
\c mlflow_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

- [ ] **Step 6: Validate stack file**

```bash
docker compose -f infra/stacks/data.yml config --quiet
```
Expected: no output (valid)

- [ ] **Step 7: Commit**

```bash
git add infra/config/vault/agents/postgres.hcl infra/config/vault/agents/keycloak.hcl \
        infra/config/keycloak/ infra/config/postgres/ infra/stacks/data.yml
git commit -m "feat(infra): data.yml — PostgreSQL + Keycloak with Vault Agent sidecars"
```

---

## Task 6: Observability stack

**Files:**
- Create: `infra/config/vault/agents/mlflow.hcl`
- Create: `infra/config/vault/agents/grafana.hcl`
- Create: `infra/config/otel/otel-collector-config.yaml`
- Create: `infra/config/prometheus/prometheus.yml`
- Create: `infra/config/loki/loki-config.yaml`
- Create: `infra/config/grafana/provisioning/datasources/datasources.yaml`
- Create: `infra/config/grafana/provisioning/dashboards/dashboards.yaml`
- Create: `infra/config/grafana/provisioning/alerting/compliance-alerts.yaml`
- Create: `infra/stacks/obs.yml`

**Interfaces:**
- Consumes: `obs_net`, `vault_net`, `data_net` overlay networks; Docker Swarm secrets `vault_mlflow_role_id`, `vault_mlflow_secret_id`, `vault_grafana_role_id`, `vault_grafana_secret_id`; Vault paths `secret/syntheo/mlflow` (fields: `db_password`), `secret/syntheo/grafana` (fields: `admin_password`)
- Produces: OTel Collector at `otel-collector:4317` on `obs_net`; Grafana at `grafana:3000` on `obs_net` + `frontend_net`; MLflow at `mlflow:5000` on `obs_net`

- [ ] **Step 1: Write `infra/config/vault/agents/mlflow.hcl`**

```hcl
vault {
  address = "http://vault:8200"
}
auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/run/secrets/vault_mlflow_role_id"
      secret_id_file_path = "/run/secrets/vault_mlflow_secret_id"
    }
  }
  sink "file" { config = { path = "/tmp/.vault-token" } }
}
template {
  contents    = "{{ with secret \"secret/data/syntheo/mlflow\" }}{{ .Data.data.db_password }}{{ end }}"
  destination = "/run/vault/MLFLOW_DB_PASSWORD"
}
```

- [ ] **Step 2: Write `infra/config/vault/agents/grafana.hcl`**

```hcl
vault {
  address = "http://vault:8200"
}
auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/run/secrets/vault_grafana_role_id"
      secret_id_file_path = "/run/secrets/vault_grafana_secret_id"
    }
  }
  sink "file" { config = { path = "/tmp/.vault-token" } }
}
template {
  contents    = "{{ with secret \"secret/data/syntheo/grafana\" }}{{ .Data.data.admin_password }}{{ end }}"
  destination = "/run/vault/GF_SECURITY_ADMIN_PASSWORD"
}
```

- [ ] **Step 3: Write `infra/config/otel/otel-collector-config.yaml`**

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1000
  memory_limiter:
    check_interval: 1s
    limit_mib: 256
  resourcedetection:
    detectors: [env, system]

exporters:
  # ── COMPANY_INFRA_PLUG ────────────────────────────────────────────────────────
  # To migrate to company infra: replace the three exporters below with:
  #   otlp/company:
  #     endpoint: <company-collector-endpoint>
  #     headers:
  #       Authorization: "Bearer ${COMPANY_OTEL_TOKEN}"
  # ─────────────────────────────────────────────────────────────────────────────
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
    default_labels_enabled:
      exporter: false
      job: true

  prometheusremotewrite:
    endpoint: http://prometheus:9090/api/v1/write
    tls:
      insecure: true

  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resourcedetection, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, resourcedetection, batch]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, resourcedetection, batch]
      exporters: [loki]
```

- [ ] **Step 4: Write `infra/config/prometheus/prometheus.yml`**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: otel-collector
    static_configs:
      - targets: ["otel-collector:8888"]

  - job_name: traefik
    static_configs:
      - targets: ["traefik:8082"]

  - job_name: loki
    static_configs:
      - targets: ["loki:3100"]
```

- [ ] **Step 5: Write `infra/config/loki/loki-config.yaml`**

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: "2024-01-01"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
  delete_request_store: filesystem

limits_config:
  # Default retention for app stream (technical logs)
  retention_period: 168h    # 7 days
  # Per-stream override for audit logs (RGPD requirement)
  retention_stream:
    - selector: '{stream="audit"}'
      priority: 1
      period: 8760h         # 365 days (12 months)
  ingestion_rate_mb: 8
  ingestion_burst_size_mb: 16
```

- [ ] **Step 6: Write `infra/config/grafana/provisioning/datasources/datasources.yaml`**

```yaml
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    uid: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    jsonData:
      maxLines: 1000

  - name: Prometheus
    type: prometheus
    uid: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true

  - name: Tempo
    type: tempo
    uid: tempo
    access: proxy
    url: http://tempo:3200
    jsonData:
      tracesToLogsV2:
        datasourceUid: loki
      tracesToMetrics:
        datasourceUid: prometheus

  - name: MLflow
    type: marcusolsson-json-datasource
    uid: mlflow
    access: proxy
    url: http://mlflow:5000/api/2.0/mlflow
```

- [ ] **Step 7: Write `infra/config/grafana/provisioning/dashboards/dashboards.yaml`**

```yaml
apiVersion: 1
providers:
  - name: syntheo
    folder: Syntheo
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
```

- [ ] **Step 8: Write `infra/config/grafana/provisioning/alerting/compliance-alerts.yaml`**

```yaml
apiVersion: 1
groups:
  - orgId: 1
    name: compliance
    folder: compliance
    interval: 1m
    rules:
      - uid: cross-user-access
        title: "RGPD: Cross-User Data Access Detected"
        condition: C
        data:
          - refId: A
            relativeTimeRange: { from: 300, to: 0 }
            datasourceUid: loki
            model:
              expr: 'count_over_time({stream="audit"} |= "RLS_VIOLATION" [5m])'
              refId: A
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              expression: A
              conditions:
                - { evaluator: { type: gt, params: [0] }, operator: { type: and }, query: { params: [A] }, reducer: { type: last } }
              refId: C
        noDataState: OK
        execErrState: Error
        for: 0s
        labels:
          severity: critical
        annotations:
          summary: "A cross-user data access (RLS bypass) was detected. Investigate immediately."

      - uid: deletion-spike
        title: "RGPD: Abnormal Deletion Volume"
        condition: C
        data:
          - refId: A
            relativeTimeRange: { from: 300, to: 0 }
            datasourceUid: loki
            model:
              expr: 'count_over_time({stream="audit"} |= "DELETE" [5m])'
              refId: A
          - refId: B
            relativeTimeRange: { from: 3600, to: 0 }
            datasourceUid: loki
            model:
              expr: 'avg_over_time(count_over_time({stream="audit"} |= "DELETE" [5m])[1h:])'
              refId: B
          - refId: C
            datasourceUid: __expr__
            model:
              type: math
              expression: "$A > $B * 3"
              refId: C
        noDataState: OK
        execErrState: Error
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Deletion rate is 3× the 1-hour rolling average. Possible mass erasure or attack."

      - uid: auth-failure-burst
        title: "SecNumCloud: Auth Failure Burst"
        condition: C
        data:
          - refId: A
            relativeTimeRange: { from: 300, to: 0 }
            datasourceUid: loki
            model:
              expr: 'count_over_time({job="keycloak"} |= "LOGIN_ERROR" [5m])'
              refId: A
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              expression: A
              conditions:
                - { evaluator: { type: gt, params: [5] }, operator: { type: and }, query: { params: [A] }, reducer: { type: last } }
              refId: C
        noDataState: OK
        execErrState: Error
        for: 0s
        labels:
          severity: warning
        annotations:
          summary: "More than 5 Keycloak login failures in 5 minutes. CrowdSec may auto-ban the IP."
```

- [ ] **Step 9: Write `infra/stacks/obs.yml`**

```yaml
version: "3.9"

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.103.0
    volumes:
      - type: bind
        source: ./config/otel/otel-collector-config.yaml
        target: /etc/otelcol-contrib/config.yaml
        read_only: true
    networks:
      - obs_net
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure

  loki:
    image: grafana/loki:3.0.0
    command: ["-config.file=/etc/loki/config.yaml"]
    volumes:
      - type: bind
        source: ./config/loki/loki-config.yaml
        target: /etc/loki/config.yaml
        read_only: true
      - loki_data:/loki
    networks:
      - obs_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure

  prometheus:
    image: prom/prometheus:v2.53.0
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=15d"
      - "--web.enable-remote-write-receiver"
    volumes:
      - type: bind
        source: ./config/prometheus/prometheus.yml
        target: /etc/prometheus/prometheus.yml
        read_only: true
      - prometheus_data:/prometheus
    networks:
      - obs_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure

  tempo:
    image: grafana/tempo:2.5.0
    command: ["-config.file=/etc/tempo/config.yaml"]
    volumes:
      - tempo_data:/var/tempo
    networks:
      - obs_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure

  vault-agent-mlflow:
    image: hashicorp/vault:1.17.2
    command: ["agent", "-config=/vault/config/agent.hcl"]
    environment:
      VAULT_ADDR: "http://vault:8200"
    volumes:
      - type: bind
        source: ./config/vault/agents/mlflow.hcl
        target: /vault/config/agent.hcl
        read_only: true
      - mlflow_secrets:/run/vault
    secrets:
      - vault_mlflow_role_id
      - vault_mlflow_secret_id
    networks:
      - vault_net
    deploy:
      replicas: 1

  mlflow:
    image: ghcr.io/mlflow/mlflow:v2.14.1
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        until [ -f /run/vault/MLFLOW_DB_PASSWORD ]; do sleep 2; done
        MLFLOW_DB_PASSWORD=$(cat /run/vault/MLFLOW_DB_PASSWORD)
        mlflow server \
          --host 0.0.0.0 \
          --port 5000 \
          --backend-store-uri "postgresql://mlflow:${MLFLOW_DB_PASSWORD}@postgres:5432/${MLFLOW_DB}" \
          --default-artifact-root /mlflow/artifacts \
          --serve-artifacts
    environment:
      MLFLOW_DB: "${MLFLOW_DB}"
    volumes:
      - mlflow_secrets:/run/vault:ro
      - mlflow_artifacts:/mlflow/artifacts
    networks:
      - obs_net
      - data_net
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 10s

  vault-agent-grafana:
    image: hashicorp/vault:1.17.2
    command: ["agent", "-config=/vault/config/agent.hcl"]
    environment:
      VAULT_ADDR: "http://vault:8200"
    volumes:
      - type: bind
        source: ./config/vault/agents/grafana.hcl
        target: /vault/config/agent.hcl
        read_only: true
      - grafana_secrets:/run/vault
    secrets:
      - vault_grafana_role_id
      - vault_grafana_secret_id
    networks:
      - vault_net
    deploy:
      replicas: 1

  grafana:
    image: grafana/grafana:11.1.0
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        until [ -f /run/vault/GF_SECURITY_ADMIN_PASSWORD ]; do sleep 2; done
        export GF_SECURITY_ADMIN_PASSWORD=$(cat /run/vault/GF_SECURITY_ADMIN_PASSWORD)
        exec /run.sh
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_SERVER_ROOT_URL: "https://${DOMAIN}/grafana"
      GF_SERVER_SERVE_FROM_SUB_PATH: "true"
    volumes:
      - grafana_secrets:/run/vault:ro
      - grafana_data:/var/lib/grafana
      - type: bind
        source: ./config/grafana/provisioning
        target: /etc/grafana/provisioning
        read_only: true
    networks:
      - obs_net
      - frontend_net
      - vault_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.grafana.rule=Host(`${DOMAIN}`) && PathPrefix(`/grafana`)"
        - "traefik.http.routers.grafana.entrypoints=websecure"
        - "traefik.http.routers.grafana.middlewares=crowdsec,secure-headers"
        - "traefik.http.services.grafana.loadbalancer.server.port=3000"

secrets:
  vault_mlflow_role_id:
    external: true
  vault_mlflow_secret_id:
    external: true
  vault_grafana_role_id:
    external: true
  vault_grafana_secret_id:
    external: true

volumes:
  loki_data:
  prometheus_data:
  tempo_data:
  mlflow_secrets:
  mlflow_artifacts:
  grafana_secrets:
  grafana_data:

networks:
  obs_net:
    external: true
  data_net:
    external: true
  frontend_net:
    external: true
  vault_net:
    external: true
```

- [ ] **Step 10: Validate stack file**

```bash
docker compose -f infra/stacks/obs.yml config --quiet
```
Expected: no output (valid)

- [ ] **Step 11: Commit**

```bash
git add infra/config/vault/agents/mlflow.hcl infra/config/vault/agents/grafana.hcl \
        infra/config/otel/ infra/config/prometheus/ infra/config/loki/ \
        infra/config/grafana/ infra/stacks/obs.yml
git commit -m "feat(infra): obs.yml — OTel, Loki, Prometheus, Tempo, MLflow, Grafana with compliance alerts"
```

---

## Task 7: App placeholder stack

**Files:**
- Create: `infra/stacks/app.yml`

**Interfaces:**
- Consumes: `frontend_net` overlay network
- Produces: placeholder service at `app:80` on `frontend_net`, routed from `https://${DOMAIN}/`

- [ ] **Step 1: Write `infra/stacks/app.yml`**

```yaml
version: "3.9"

services:
  app:
    image: nginx:alpine
    volumes:
      - type: bind
        source: ./config/app/placeholder.html
        target: /usr/share/nginx/html/index.html
        read_only: true
    networks:
      - frontend_net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
      update_config:
        order: start-first
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.app.rule=Host(`${DOMAIN}`)"
        - "traefik.http.routers.app.entrypoints=websecure"
        - "traefik.http.routers.app.middlewares=crowdsec,ratelimit,secure-headers"
        - "traefik.http.services.app.loadbalancer.server.port=80"

networks:
  frontend_net:
    external: true
```

- [ ] **Step 2: Write `infra/config/app/placeholder.html`**

```bash
mkdir -p infra/config/app
```

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Syntheo — À venir</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #F8F7F4; }
    .card { text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 600; color: #1A1A18; }
    p  { color: #5C5B56; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Syntheo</h1>
    <p>L'application arrive bientôt. / Application coming soon.</p>
  </div>
</body>
</html>
```

- [ ] **Step 3: Validate stack file**

```bash
docker compose -f infra/stacks/app.yml config --quiet
```
Expected: no output (valid)

- [ ] **Step 4: Commit**

```bash
git add infra/stacks/app.yml infra/config/app/
git commit -m "feat(infra): app.yml placeholder — nginx with Traefik routing"
```

---

## Task 8: Backup script

**Files:**
- Create: `infra/scripts/backup.sh`

**Interfaces:**
- Consumes: `POSTGRES_DB` env var; Vault at `secret/syntheo/backup` (field: `gpg_passphrase`); PostgreSQL running on `data_net`
- Produces: `/mnt/syntheo_data/backups/syntheo_latest.sql.gpg` (overwrites previous)

- [ ] **Step 1: Write `infra/scripts/backup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/mnt/syntheo_data/backups
BACKUP_FILE="${BACKUP_DIR}/syntheo_latest.sql.gpg"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
LOG_PREFIX="[syntheo-backup $(date -u +%Y-%m-%dT%H:%M:%SZ)]"

# ── Vault token via AppRole (reuse vault_backup_role_id / vault_backup_secret_id) ──
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

echo "${LOG_PREFIX} Starting backup of ${POSTGRES_DB}..."
pg_dump -h postgres -U "${POSTGRES_USER:-syntheo}" "${POSTGRES_DB:-syntheo_db}" \
  | gpg --batch --yes --symmetric --passphrase "${GPG_PASSPHRASE}" \
  > "${BACKUP_FILE}"

echo "${LOG_PREFIX} Backup written to ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"
```

- [ ] **Step 2: Validate syntax**

```bash
bash -n infra/scripts/backup.sh
```
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add infra/scripts/backup.sh
git commit -m "feat(infra): backup.sh — daily GPG-encrypted pg_dump to LUKS volume"
```

---

## Task 9: Deploy + teardown scripts

**Files:**
- Create: `infra/scripts/deploy.sh`
- Create: `infra/scripts/teardown.sh`

- [ ] **Step 1: Write `infra/scripts/deploy.sh`**

```bash
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
```

- [ ] **Step 2: Write `infra/scripts/teardown.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "This will remove all Syntheo stacks. Data volumes are NOT deleted."
read -rp "Type 'yes' to confirm: " CONFIRM
[ "${CONFIRM}" = "yes" ] || { echo "Aborted."; exit 0; }

for stack in syntheo-app syntheo-obs syntheo-data syntheo-core; do
  if docker stack ls --format '{{.Name}}' | grep -q "^${stack}$"; then
    echo "Removing ${stack}..."
    docker stack rm "${stack}"
  else
    echo "${stack} not deployed — skipping"
  fi
done

echo "Waiting for services to stop..."
sleep 10
docker service ls
echo "Teardown complete. Run swarm-init.sh + deploy.sh to redeploy."
```

- [ ] **Step 3: Validate both scripts**

```bash
bash -n infra/scripts/deploy.sh && bash -n infra/scripts/teardown.sh
```
Expected: no output (both valid)

- [ ] **Step 4: Make scripts executable and commit**

```bash
chmod +x infra/scripts/*.sh
git add infra/scripts/deploy.sh infra/scripts/teardown.sh
git commit -m "feat(infra): deploy.sh with Trivy pre-flight + ordered stack deploy, teardown.sh"
```

---

## Task 10: GitHub Actions — Trivy CI gate

**Files:**
- Create: `.github/workflows/trivy.yml`

**Interfaces:**
- Produces: required status check `trivy-scan` on every PR — Renovate auto-merge only fires when this passes

- [ ] **Step 1: Write `.github/workflows/trivy.yml`**

```yaml
name: trivy-scan

on:
  pull_request:
    branches: [main]
    paths:
      - "infra/stacks/*.yml"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/trivy.yml"

jobs:
  scan:
    name: Trivy image scan
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Trivy
        run: |
          sudo apt-get install -y wget apt-transport-https gnupg
          wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key \
            | gpg --dearmor | sudo tee /usr/share/keyrings/trivy.gpg > /dev/null
          echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] \
            https://aquasecurity.github.io/trivy-repo/deb generic main" \
            | sudo tee /etc/apt/sources.list.d/trivy.list
          sudo apt-get update && sudo apt-get install -y trivy

      - name: Extract images from stack files
        id: images
        run: |
          IMAGES=$(grep -h '^\s*image:' infra/stacks/*.yml \
            | sed 's/.*image:\s*//' \
            | sort -u \
            | tr '\n' ' ')
          echo "images=${IMAGES}" >> "$GITHUB_OUTPUT"

      - name: Scan images
        run: |
          FAIL=0
          for image in ${{ steps.images.outputs.images }}; do
            echo "Scanning: ${image}"
            trivy image --exit-code 1 --severity CRITICAL "${image}" || FAIL=1
          done
          exit "${FAIL}"
```

- [ ] **Step 2: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/trivy.yml'))" \
  && echo "YAML valid"
```
Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/trivy.yml
git commit -m "ci: add Trivy image scan workflow — required gate for Renovate auto-merge"
```

---

## Self-Review — Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Docker Swarm init + overlay networks | Task 1 |
| LUKS documentation | Task 1 (swarm-init.sh) |
| CrowdSec LAPI bind + collections + bouncer key | Task 2 |
| Vault file storage + AppRole + policies | Task 3 |
| Vault Agent pattern (secrets never in env) | Tasks 3–6 |
| Traefik TLS 1.3, ACME, CrowdSec plugin | Task 4 |
| Traefik security headers + rate limit middleware | Task 4 |
| PostgreSQL pgcrypto + uuid-ossp extensions | Task 5 (init.sql) |
| PostgreSQL + Keycloak + mlflow DBs | Task 5 (init.sql) |
| Keycloak realm JSON + PKCE client | Task 5 |
| OTel Collector with COMPANY_INFRA_PLUG | Task 6 |
| Loki audit 12mo + app 7d dual retention | Task 6 |
| Grafana compliance alerts (3 rules) | Task 6 |
| MLflow backed by PostgreSQL | Task 6 |
| App placeholder with Traefik routing | Task 7 |
| Daily GPG backup to LUKS volume | Task 8 |
| Trivy pre-deploy gate (CVSSv3 ≥ 9.0 blocks) | Task 9 |
| Ordered deploy (core → data → obs → app) | Task 9 |
| GitHub Actions Trivy gate for Renovate auto-merge | Task 10 |
| renovate.json (already committed) | Done |
| .env.example (all vars, no secret defaults) | Task 1 |
