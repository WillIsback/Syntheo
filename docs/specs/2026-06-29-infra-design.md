---
name: infra-design
description: Syntheo MVP infrastructure design — Docker Swarm, Traefik, Vault, PostgreSQL, Keycloak, Observability on OVH VPS France
metadata:
  type: project
  status: approved
  date: 2026-06-29
---

# Syntheo — Infrastructure Design

## Context

Syntheo is a privacy-first AI meeting transcription SaaS targeting RGPD, IA Act, and SecNumCloud compliance. This document covers the infrastructure layer for the MVP, deployed on a single OVH VPS (France, droit français).

**AI services are external and already running** on a DGX Spark via an authenticated gateway at `api.willisback.fr`:
- WhisperX: `https://api.willisback.fr/whisper/asr/v1`
- LLM (Qwen3-35B via vLLM): `https://api.willisback.fr/llm/v1`
- Embeddings, reranking, OCR also available at the same gateway

No local WhisperX or vLLM containers are needed on the VPS.

## Constraints

- **Hosting:** OVH SAS France only — no US cloud dependencies (SecNumCloud)
- **Portability:** All domain names and credentials in env vars — no hardcoded strings. The app will be migrated to a company domain once approved.
- **Plug design:** Every integration point (reverse proxy, observability backend, secret store) is a replaceable plug, not a built-in.
- **Domain (MVP):** `syntheo.willisback.fr`

## Architecture: Multi-Stack Docker Swarm

### Why Swarm over plain Compose

- Rolling zero-downtime deploys required by the MVP plan (Art. 32 RGPD — availability)
- Stack isolation: each concern can be updated or replaced independently
- Native overlay networks with internal DNS
- Secrets management via Vault Agent (no env var secrets)

### Stack files

```
infra/
├── stacks/
│   ├── core.yml      # Traefik (ingress plug) + Vault (secrets)
│   ├── data.yml      # PostgreSQL + Keycloak
│   ├── obs.yml       # OTel Collector + Grafana + Loki + Prometheus + Tempo + MLflow
│   └── app.yml       # Next.js application
├── config/
│   ├── traefik/      # traefik.yml + dynamic config (TLS, middlewares)
│   ├── vault/        # vault.hcl (storage, listeners, seal)
│   ├── otel/         # otel-collector-config.yaml
│   ├── prometheus/   # prometheus.yml (scrape targets)
│   ├── grafana/      # provisioning/ (datasources, dashboards)
│   └── keycloak/     # syntheo realm export JSON
├── scripts/
│   ├── swarm-init.sh       # One-time: swarm init + overlay network creation + LUKS doc
│   ├── vault-init.sh       # One-time: vault init + unseal + AppRole policies
│   ├── crowdsec-setup.sh   # One-time: configure CrowdSec LAPI bind + Traefik bouncer key
│   ├── deploy.sh           # Trivy pre-flight + deploy all stacks in order
│   ├── backup.sh           # Daily encrypted pg_dump → local LUKS volume (cron target)
│   └── teardown.sh         # Reverse-order teardown
└── .env.example            # All env vars documented; no secret defaults
```

### Deployment order

Enforced by `deploy.sh`:
0. **Trivy pre-flight** — scan all images; abort if CVSSv3 ≥ 9.0 critical found
1. `core.yml` — Traefik + Vault must be up first
2. `data.yml` — PostgreSQL + Keycloak (depend on Vault)
3. `obs.yml` — Observability stack (depends on Vault + PostgreSQL for MLflow)
4. `app.yml` — Next.js (depends on all above)

## Network Topology

```
Internet
    │  443/80
    ▼
[Traefik]  ←── core.yml (ONLY public-facing service)
    │
    │ frontend_net (overlay, NOT internal — allows outbound internet)
    │ Traefik routes to Next.js via overlay DNS; Next.js calls api.willisback.fr outbound
    ▼
[Next.js app]
    │
    ├── data_net (overlay, internal) ──► [PostgreSQL]
    │                                └── [Keycloak]
    │
    ├── vault_net (overlay, internal) ──► [Vault]
    │   (PostgreSQL, Keycloak, OTel, Next.js all join this)
    │
    └── obs_net (overlay, internal) ──► [OTel Collector]
                                              │
                                  ┌───────────┼───────────┐
                                  ▼           ▼           ▼
                              [Grafana]    [Loki]    [Prometheus]
                                                         │
                                                     [Tempo]
                                                     [MLflow]
```

**Rules:**
- No service except Traefik has a `ports:` entry
- All inter-service communication uses overlay DNS (`http://postgres:5432`, etc.)
- `vault_net` is joined by every service that reads secrets
- `obs_net` is self-contained: removing `obs.yml` and cutting OTel from `vault_net` fully unplugs observability

## Service Specifications

### Traefik — ingress plug (`core.yml`)

- Listens on 80 (HTTP → HTTPS redirect) and 443 (TLS 1.3 minimum)
- Let's Encrypt ACME (HTTP-01 challenge), cert stored in named volume `traefik_certs`
- Dashboard enabled behind BasicAuth (credentials from Vault at `secret/syntheo/traefik`)
- Dynamic config middlewares:
  - `crowdsec`: CrowdSec bouncer plugin (see below) — applied first on all routers
  - `ratelimit`: 100 req/s per IP
  - `secure-headers`: HSTS (1 year, includeSubDomains), CSP strict, X-Frame-Options DENY, X-Content-Type-Options nosniff
- **Migration:** remove `core.yml`, point company reverse proxy at `app` and `keycloak` on `frontend_net`. No labels or Traefik-specific config in any other stack file.

### CrowdSec — brute-force and WAF protection (host + Traefik plugin)

CrowdSec is already installed on the VPS host (systemd). It is **not** a Docker container — it runs at the OS level alongside Docker Swarm.

**Integration model:**
- Traefik loads the plugin `maxlerebourg/crowdsec-bouncer-traefik-plugin` (Yaegi middleware — no separate binary, no extra container)
- The plugin queries CrowdSec LAPI over `host.docker.internal:8080` (Docker `extra_hosts` → host gateway)
- CrowdSec LAPI must bind `0.0.0.0:8080` (not `127.0.0.1`) — configured in `crowdsec-setup.sh`
- AppSec/WAF enabled: CrowdSec listens on `0.0.0.0:7422`, plugin forwards every request for inline inspection before it reaches Next.js

**Traefik static config (`config/traefik/traefik.yml`):**
```yaml
experimental:
  plugins:
    bouncer:
      moduleName: github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin
      version: v1.6.0
entryPoints:
  web:
    address: ":80"
    forwardedHeaders:
      trustedIPs: ["172.16.0.0/12"]   # Docker overlay range — real client IP passthrough
  websecure:
    address: ":443"
    forwardedHeaders:
      trustedIPs: ["172.16.0.0/12"]
```

**Traefik dynamic config (`config/traefik/dynamic.yml`):**
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
          crowdsecLapiHost: host.docker.internal:8080   # host LAPI via gateway
          crowdsecAppsecEnabled: true
          crowdsecAppsecHost: host.docker.internal:7422
          forwardedHeadersTrustedIPs: ["172.16.0.0/12"]
```

Bouncer key: registered by `crowdsec-setup.sh` via `cscli bouncers add traefik -o raw` on the host and stored in Vault at `secret/syntheo/traefik` (alongside the dashboard BasicAuth hash). The plugin reads it from the Vault-Agent-injected env file.

**`crowdsec-setup.sh` responsibilities (one-time, run on VPS host):**
1. Edit `/etc/crowdsec/config.yaml` → set `listen_uri: 0.0.0.0:8200` for LAPI and `listen_addr: 0.0.0.0:7422` for AppSec
2. Install collections: `cscli collections install crowdsecurity/traefik crowdsecurity/http-cve crowdsecurity/appsec-virtual-patching`
3. Register Traefik bouncer key: `cscli bouncers add traefik -o raw` → output stored in Vault
4. `systemctl restart crowdsec`

**Migration:** CrowdSec stays on the host regardless of which reverse proxy is used. When Traefik is replaced, remove the plugin middleware from Traefik config and wire the new proxy's native CrowdSec bouncer (nginx, haproxy, caddy) or the firewall bouncer.

### HashiCorp Vault (`core.yml`)

- Storage backend: `file` on LUKS-encrypted volume `/vault/data` (single-node, upgradeable to Raft for HA)
- Plaintext HTTP listener on `vault_net` only (`http://vault:8200`) — no TLS needed on the internal overlay network; TLS termination for external traffic is Traefik's job. Production upgrade path: mutual TLS between Vault and agents.
- Not exposed via Traefik
- **Auto-unseal:** not configured for MVP — manual `vault operator unseal` on restart. Production upgrade path: Transit auto-unseal or cloud HSM.
- Auth method: AppRole per service (separate role_id/secret_id per stack)
- Secret paths:
  - `secret/syntheo/postgres` — POSTGRES_USER, POSTGRES_PASSWORD
  - `secret/syntheo/keycloak` — KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD, KC_DB_PASSWORD
  - `secret/syntheo/app` — API key for `api.willisback.fr`, NextAuth secret, session secret
  - `secret/syntheo/obs` — Grafana admin password, MLflow auth
  - `secret/syntheo/traefik` — dashboard BasicAuth hash
- **Vault Agent pattern:** each dependent service runs a Vault Agent container on a shared in-memory `tmpfs` volume. Agent fetches secrets at startup and writes them as environment files. No secret touches disk or an env var in the Compose definition.

### PostgreSQL (`data.yml`)

- Image: `postgres:16-alpine`
- Data volume: named volume `postgres_data`, mounted on LUKS-encrypted path (setup documented in `swarm-init.sh`)
- Extensions enabled at init: `pgcrypto`, `uuid-ossp`
- Row-Level Security: enabled by default on all user tables (schema migrations handled in the DB layer sub-project)
- Three logical databases: `syntheo_db`, `keycloak_db`, `mlflow_db`
- Credentials injected by Vault Agent — never in env vars

### Keycloak (`data.yml`)

- Image: `quay.io/keycloak/keycloak:24`
- Realm `syntheo` pre-loaded from `config/keycloak/syntheo-realm.json`
- Client `syntheo-app`: confidential, Authorization Code + PKCE, redirect URIs via `${DOMAIN}` env var
- Backed by PostgreSQL (`keycloak_db`)
- Admin credentials from Vault at `secret/syntheo/keycloak`
- **Migration:** realm export is portable JSON — import into company Keycloak or any OIDC provider

### Observability (`obs.yml`)

**OTel Collector:**
- Receivers: OTLP gRPC (4317) and HTTP (4318) on `obs_net`
- Processors: batch, memory_limiter, resource detection
- Exporters: Loki (logs), Prometheus remote_write (metrics), Tempo (traces)
- **Migration plug:** `exporters:` section has a clearly marked `# COMPANY_INFRA_PLUG` comment block. Replace the three exporters with a single OTLP exporter pointing at company collector endpoint.

**Grafana:**
- Provisioned datasources: Loki, Prometheus, Tempo, MLflow (no manual UI setup)
- Pre-built dashboards: Syntheo app metrics, WhisperX job latency, PostgreSQL health
- Admin password from Vault
- Compliance alerts provisioned from `config/grafana/alerts/` (no manual UI setup):
  - **cross-user-access** — fires if a query hits a row belonging to another `user_id` (RLS bypass or error) → severity critical
  - **deletion-spike** — fires if DELETE count in 5 min > 3× rolling average → severity warning
  - **auth-failure-burst** — fires if Keycloak login failures > 5 in 5 min on same account → severity warning, feeds CrowdSec decision via webhook

**Loki:** two streams with separate retention policies (RGPD requirement):
- `audit` stream (consent logs, data access events) — **12-month retention**, append-only, read access restricted to admin role
- `app` stream (errors, performance, debug) — **7-day retention**, normal policy

**Prometheus:** metrics scrape, 15-day retention

**Tempo:** distributed traces, 7-day retention

**MLflow:** tracking server backed by `mlflow_db` in PostgreSQL, artifact store on named volume. Every WhisperX transcription and LLM report generation logs a `run_id` here (IA Act traceability requirement).

## Environment Variables

All in `.env` at repo root (gitignored). `.env.example` documents every variable with no secret defaults.

```bash
# Domain & TLS
DOMAIN=syntheo.willisback.fr
ACME_EMAIL=william.derue@gmail.com

# Vault
VAULT_ADDR=http://vault:8200

# Database names (not credentials — those come from Vault)
POSTGRES_DB=syntheo_db
KEYCLOAK_DB=keycloak_db
MLFLOW_DB=mlflow_db

# External AI services (api.willisback.fr gateway)
WHISPERX_BASE_URL=https://api.willisback.fr/whisper/asr/v1
LLM_BASE_URL=https://api.willisback.fr/llm/v1
LLM_MODEL=nvidia/Qwen3.6-35B-A3B-NVFP4

# Keycloak OIDC (no secrets here)
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=syntheo
KEYCLOAK_CLIENT_ID=syntheo-app

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
MLFLOW_TRACKING_URI=http://mlflow:5000
```

## LUKS Encryption

LUKS is an OS-level concern, done once manually on the VPS before first deploy. `swarm-init.sh` documents the commands but does not run them (requires interactive passphrase entry):

```bash
# On VPS — one-time setup
cryptsetup luksFormat /dev/sdb          # dedicated data disk
cryptsetup open /dev/sdb syntheo_data
mkfs.ext4 /dev/mapper/syntheo_data
mount /dev/mapper/syntheo_data /mnt/syntheo_data
# Add to /etc/crypttab for reboot handling (with keyfile or manual unseal)
```

PostgreSQL and Vault data volumes are bind-mounted to `/mnt/syntheo_data/postgres` and `/mnt/syntheo_data/vault`.

## Backup Strategy (MVP)

Daily encrypted local backup — minimal but compliant for MVP. Off-VPS backup is a post-MVP upgrade.

**`scripts/backup.sh`** (cron target, runs daily at 02:00):
```bash
pg_dump -U $POSTGRES_USER $POSTGRES_DB \
  | gpg --batch --symmetric --passphrase-file /run/secrets/backup_passphrase \
  > /mnt/syntheo_data/backups/syntheo_latest.sql.gpg
```

- Overwrites the previous day's file (`syntheo_latest.sql.gpg`) — single rotating backup, no accumulation
- Backup passphrase stored in Vault at `secret/syntheo/backup`, injected at cron runtime via a wrapper that fetches it from Vault
- Backup stored on the LUKS-encrypted volume (`/mnt/syntheo_data/backups/`) — encrypted at rest by the underlying disk, plus GPG symmetric encryption for the file itself
- Cron job installed on the VPS host by `swarm-init.sh`
- **Upgrade path:** replace the GPG file write with an OVH Object Storage upload (`s3cmd put`) keeping French jurisdiction

## Trivy — Image Security Scanning

Integrated as a pre-deploy gate in `deploy.sh`, not a running container:

```bash
# deploy.sh — step 0
for image in traefik:v3 hashicorp/vault:latest postgres:16-alpine \
             quay.io/keycloak/keycloak:24 syntheo/app:$VERSION; do
  trivy image --exit-code 1 --severity CRITICAL "$image" || {
    echo "CRITICAL CVE found in $image — deploy aborted"
    exit 1
  }
done
```

Trivy must be installed on the VPS host (`apt install trivy`). Documented in `swarm-init.sh`.

## Out of Scope for this Sub-project

- Database schema, RLS policies, pgcrypto column encryption — DB layer sub-project
- Next.js application code — App sub-project
- Keycloak realm fine-tuning (scopes, mappers) — Auth sub-project
- AIPD document — compliance sub-project
- Vault HA / auto-unseal — post-MVP hardening

## Migration Checklist (when project is accepted)

- [ ] Replace `core.yml` with company reverse proxy config
- [ ] Update `DOMAIN` env var
- [ ] Update Keycloak redirect URIs (or migrate realm to company SSO)
- [ ] Replace OTel exporter block with company OTLP endpoint
- [ ] Update `ACME_EMAIL` or remove ACME (company may manage certs)
- [ ] Review Vault policies — company may have a central Vault
- [ ] Wire company reverse proxy to CrowdSec (firewall bouncer or native plugin)
- [ ] Replace local backup cron with company backup infrastructure
