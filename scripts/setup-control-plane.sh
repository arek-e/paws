#!/bin/bash
# /\_/\
# ( o.o )  paws control plane setup
#  > ^ <
#
# One-command deployment of the full paws control plane stack.
#
# Prerequisites:
#   - Docker + Docker Compose installed
#   - .env file configured (cp .env.example .env)
#   - DNS records pointing to this server:
#       *.DOMAIN       A record → server IP
#       tunnel.DOMAIN  A record → server IP (DNS-only, no CF proxy)
#
# What it does:
#   1. Validates .env configuration
#   2. Generates Pangolin + Traefik config from .env
#   3. Generates secrets if not set
#   4. Builds and starts all containers
#   5. Prints next steps (Pangolin initial setup URL)

set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo " /\\_/\\"
echo "( o.o )  paws control plane setup"
echo " > ^ <"
echo ""

# ── Load .env ───────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "Error: .env file not found. Run: cp .env.example .env"
  exit 1
fi
set -a
source .env
set +a

# ── Validate required vars ─────────────────────────────────────────────────
MISSING=()
[[ -z "${DOMAIN:-}" ]] && MISSING+=("DOMAIN")
[[ -z "${TUNNEL_DOMAIN:-}" ]] && MISSING+=("TUNNEL_DOMAIN")
[[ -z "${CF_DNS_API_TOKEN:-}" ]] && MISSING+=("CF_DNS_API_TOKEN")
[[ -z "${ACME_EMAIL:-}" ]] && MISSING+=("ACME_EMAIL")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: Missing required variables in .env:"
  for var in "${MISSING[@]}"; do echo "  - $var"; done
  exit 1
fi

# ── Generate secrets if not set ─────────────────────────────────────────────
if [[ -z "${API_KEY:-}" || "$API_KEY" == "paws-dev-key" ]]; then
  API_KEY=$(openssl rand -hex 24)
  sed -i "s|^API_KEY=.*|API_KEY=$API_KEY|" .env
  echo "Generated API_KEY"
fi

if [[ -z "${AUTH_SECRET:-}" || "$AUTH_SECRET" == *"change-me"* ]]; then
  AUTH_SECRET=$(openssl rand -hex 32)
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" .env
  echo "Generated AUTH_SECRET"
fi

if [[ -z "${OIDC_CLIENT_SECRET:-}" || "$OIDC_CLIENT_SECRET" == *"changeme"* ]]; then
  OIDC_CLIENT_SECRET=$(openssl rand -hex 24)
  sed -i "s|^OIDC_CLIENT_SECRET=.*|OIDC_CLIENT_SECRET=$OIDC_CLIENT_SECRET|" .env
  echo "Generated OIDC_CLIENT_SECRET"
fi

if [[ -z "${PANGOLIN_SECRET:-}" || "$PANGOLIN_SECRET" == *"change-me"* ]]; then
  PANGOLIN_SECRET=$(openssl rand -hex 32)
  sed -i "s|^PANGOLIN_SECRET=.*|PANGOLIN_SECRET=$PANGOLIN_SECRET|" .env
  echo "Generated PANGOLIN_SECRET"
fi

# ── Generate Pangolin config ────────────────────────────────────────────────
echo "==> Generating Pangolin config..."
mkdir -p config/pangolin

cat > config/pangolin/config.yml << EOF
gerbil:
  start_port: 51820
  base_endpoint: "${TUNNEL_DOMAIN}"

app:
  dashboard_url: "https://pangolin.${DOMAIN}"
  log_level: "info"

domains:
  domain1:
    base_domain: "${DOMAIN}"

server:
  secret: "${PANGOLIN_SECRET}"
  cors:
    origins:
      - "https://pangolin.${DOMAIN}"
      - "https://fleet.${DOMAIN}"
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
    allowed_headers: ["X-CSRF-Token", "Content-Type", "Authorization"]
    credentials: true

flags:
  require_email_verification: false
  disable_signup_without_invite: true
  disable_user_create_org: false
  allow_raw_resources: true
EOF

# ── Generate Dex config ────────────────────────────────────────────────────
echo "==> Generating Dex config..."
mkdir -p config/dex

cat > config/dex/config.yaml << EOF
issuer: https://fleet.${DOMAIN}/dex

storage:
  type: sqlite3
  config:
    file: /data/dex.db

web:
  http: 0.0.0.0:5556

staticClients:
  - id: paws-control-plane
    name: paws
    redirectURIs:
      - https://fleet.${DOMAIN}/auth/callback
    secret: ${OIDC_CLIENT_SECRET}

enablePasswordDB: true
EOF

# ── Generate Traefik config ─────────────────────────────────────────────────
echo "==> Generating Traefik config..."
mkdir -p config/traefik

cat > config/traefik/traefik_config.yml << EOF
api:
  insecure: true

log:
  level: INFO

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt
    transport:
      respondingTimeouts:
        readTimeout: "30s"

certificatesResolvers:
  letsencrypt:
    acme:
      email: "${ACME_EMAIL}"
      storage: /letsencrypt/acme.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"

providers:
  http:
    endpoint: "http://pangolin:3001/api/v1/traefik-config"
    pollInterval: "5s"
EOF

# ── Build and start ─────────────────────────────────────────────────────────
echo "==> Building control plane image..."
docker compose build gateway

echo "==> Starting all services..."
docker compose up -d

echo ""
echo " /\\_/\\"
echo "( ^.^ )  all services starting!"
echo " > ^ <"
echo ""
echo "Services:"
echo "  Pangolin dashboard: https://pangolin.${DOMAIN}"
echo "  Paws dashboard:     https://fleet.${DOMAIN}"
echo "  Grafana:            https://${GRAFANA_DOMAIN:-grafana.${DOMAIN}}"
echo ""
echo "Next steps:"
echo "  1. Wait ~30s for Pangolin to start"
echo "  2. Visit https://pangolin.${DOMAIN}/auth/initial-setup"
echo "  3. Create admin account"
echo "  4. In Pangolin dashboard, create resources:"
echo "     - fleet.${DOMAIN} → http://gateway:4000 (local site)"
echo "     - grafana.${DOMAIN} → http://grafana:3001 (local site)"
echo "  5. Create a site for each worker, note the Site ID + Secret"
echo "  6. On each worker: ./scripts/setup-worker.sh"
echo "  7. Update .env with PANGOLIN_API_KEY and PANGOLIN_ORG_ID"
echo "     then: docker compose restart gateway"
echo ""
echo "Check status: docker compose ps"
echo "View logs:    docker compose logs -f"
