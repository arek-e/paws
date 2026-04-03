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
#   2. Generates Dex config from .env
#   3. Generates secrets if not set
#   4. Builds and starts all containers
#   5. Prints next steps

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
if [[ -z "${DOMAIN:-}" ]]; then
  echo "Error: DOMAIN is required in .env"
  exit 1
fi

# CF_DNS_API_TOKEN is optional — if set, use DNS challenge; otherwise HTTP challenge
if [[ -n "${CF_DNS_API_TOKEN:-}" ]]; then
  TLS_MODE="cloudflare"
  echo "TLS mode: Cloudflare DNS challenge"
elif [[ -n "${ACME_EMAIL:-}" ]]; then
  TLS_MODE="http"
  echo "TLS mode: HTTP-01 challenge (no Cloudflare needed)"
else
  TLS_MODE="none"
  echo "TLS mode: disabled (set ACME_EMAIL to enable Let's Encrypt)"
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

# ── Generate Dex config ────────────────────────────────────────────────────
echo "==> Generating Dex config..."
mkdir -p config/dex

cat > config/dex/config.yaml << EOF
issuer: https://${DOMAIN}/dex

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
      - https://${DOMAIN}/auth/callback
    secret: ${OIDC_CLIENT_SECRET}

enablePasswordDB: true
EOF

# ── Build and start ─────────────────────────────────────────────────────────
echo "==> Building control plane image..."
docker compose build gateway

echo "==> Starting all services..."
docker compose up -d

echo ""
echo " /\\_/\\"
echo "( ^.^ )  paws is running!"
echo " > ^ <"
echo ""
echo "  Dashboard:    https://${DOMAIN}"
echo "  Grafana:      https://${DOMAIN}/grafana/"
echo "  API:          https://${DOMAIN}/v1/"
echo ""
echo "Next steps:"
echo "  1. Open https://${DOMAIN} — the paws dashboard"
echo "  2. Follow the setup wizard to add a worker"
echo "  3. Add a credential (Anthropic API key)"
echo "  4. Create your first daemon"
echo ""
echo "Update:  paws update"
echo "Status:  docker compose ps"
echo "Logs:    docker compose logs -f"
