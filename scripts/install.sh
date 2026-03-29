#!/bin/bash
# /\_/\
# ( o.o )  paws one-line installer
#  > ^ <
#
# Usage:
#   curl -fsSL https://get.paws.dev/install.sh | bash
#
# Or with a domain:
#   curl -fsSL https://get.paws.dev/install.sh | bash -s -- --domain tpops.dev
#
# What it does:
#   1. Installs Docker + Docker Compose (if missing)
#   2. Clones the paws repo
#   3. Optionally asks for a domain (works on bare IP without one)
#   4. Generates all secrets and configs
#   5. Starts the full stack
#   6. Prints your dashboard URL
#
# Requirements:
#   - Linux (Ubuntu/Debian/Fedora/CentOS)
#   - Root access
#   - Ports 80, 443, 51820/udp open
#
# Domain setup (do this AFTER install, or before):
#   Point these DNS records to your server's IP:
#     *.yourdomain.com  →  A record  →  SERVER_IP
#   TLS certificates are provisioned automatically via Let's Encrypt.
#   No Cloudflare account needed.

set -euo pipefail

PAWS_DIR="/opt/paws"
PAWS_REPO="https://github.com/arek-e/paws.git"
PAWS_BRANCH="main"

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_cat() {
  echo ""
  echo -e "${GREEN} /\\_/\\"
  echo -e "( o.o )  $1"
  echo -e " > ^ <${NC}"
  echo ""
}

info() { echo -e "${CYAN}==> $1${NC}"; }
warn() { echo -e "${YELLOW}⚠  $1${NC}"; }
error() { echo -e "${RED}✗  $1${NC}"; exit 1; }
ok() { echo -e "${GREEN}✓  $1${NC}"; }

# ── Parse arguments ────────────────────────────────────────────────────────
DOMAIN=""
ACME_EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) ACME_EMAIL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── Welcome ────────────────────────────────────────────────────────────────
print_cat "paws installer"

echo "This will install paws on this server."
echo "No Cloudflare or DNS provider account needed."
echo "TLS certificates are automatic via Let's Encrypt."
echo ""

# ── Check root ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Please run as root: curl ... | sudo bash"
fi

# ── Detect OS ──────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS=$ID
else
  OS="unknown"
fi
info "Detected OS: $OS"

# ── Install Docker if missing ──────────────────────────────────────────────
if command -v docker &>/dev/null; then
  ok "Docker already installed ($(docker --version | head -1))"
else
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed"
fi

if docker compose version &>/dev/null; then
  ok "Docker Compose available"
else
  error "Docker Compose not found. Please install Docker Compose v2."
fi

# ── Install git if missing ────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  info "Installing git..."
  apt-get update -qq && apt-get install -y -qq git || yum install -y git || true
fi

# ── Get server IP ─────────────────────────────────────────────────────────
SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || curl -s4 icanhazip.com 2>/dev/null || echo "unknown")
info "Server IP: ${SERVER_IP}"

# ── Interactive prompts ───────────────────────────────────────────────────
echo ""
echo "You can configure a domain now or later from the dashboard."
echo "Without a domain, paws runs on http://${SERVER_IP}"
echo ""

if [[ -z "$DOMAIN" ]]; then
  read -rp "$(echo -e "${CYAN}Domain${NC} (leave empty to skip): ")" DOMAIN
fi

if [[ -n "$DOMAIN" ]]; then
  TUNNEL_DOMAIN="tunnel.${DOMAIN}"

  if [[ -z "$ACME_EMAIL" ]]; then
    read -rp "$(echo -e "${CYAN}Email${NC} (for Let's Encrypt, required with domain): ")" ACME_EMAIL
  fi

  if [[ -z "$ACME_EMAIL" ]]; then
    error "Email is required for Let's Encrypt certificates"
  fi

  # Check DNS
  info "Checking DNS for *.${DOMAIN}..."
  RESOLVED_IP=$(dig +short "fleet.${DOMAIN}" 2>/dev/null | head -1 || echo "")
  if [[ "$RESOLVED_IP" == "$SERVER_IP" ]]; then
    ok "DNS looks good: fleet.${DOMAIN} → ${SERVER_IP}"
  elif [[ -n "$RESOLVED_IP" ]]; then
    warn "fleet.${DOMAIN} resolves to ${RESOLVED_IP} (expected ${SERVER_IP})"
    warn "TLS certificates won't provision until DNS points here"
  else
    warn "fleet.${DOMAIN} doesn't resolve yet"
    warn "Add these DNS records to your domain:"
    echo "    *.${DOMAIN}       A  →  ${SERVER_IP}"
    echo "    ${TUNNEL_DOMAIN}  A  →  ${SERVER_IP}"
    warn "paws will start, but HTTPS won't work until DNS is configured"
  fi
else
  TUNNEL_DOMAIN=""
  ACME_EMAIL=""
  info "No domain — running on http://${SERVER_IP}"
fi

# ── Clone or update repo ──────────────────────────────────────────────────
if [[ -d "$PAWS_DIR/.git" ]]; then
  info "Updating existing paws installation..."
  cd "$PAWS_DIR"
  git pull origin "$PAWS_BRANCH" || true
else
  info "Cloning paws..."
  git clone --depth 1 --branch "$PAWS_BRANCH" "$PAWS_REPO" "$PAWS_DIR"
  cd "$PAWS_DIR"
fi
ok "paws source at ${PAWS_DIR}"

# ── Generate secrets ──────────────────────────────────────────────────────
info "Generating configuration..."

API_KEY=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -hex 32)
OIDC_CLIENT_SECRET=$(openssl rand -hex 24)
PANGOLIN_SECRET=$(openssl rand -hex 32)
PANGOLIN_OIDC_SECRET=$(openssl rand -hex 24)
GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)

# ── Generate .env ──────────────────────────────────────────────────────────
cat > .env << EOF
# Generated by paws installer on $(date -u +%Y-%m-%dT%H:%M:%SZ)
DOMAIN=${DOMAIN:-localhost}
TUNNEL_DOMAIN=${TUNNEL_DOMAIN:-localhost}
GRAFANA_DOMAIN=${DOMAIN:+grafana.${DOMAIN}}
ACME_EMAIL=${ACME_EMAIL:-}
API_KEY=${API_KEY}
AUTH_SECRET=${AUTH_SECRET}
OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
PANGOLIN_SECRET=${PANGOLIN_SECRET}
PANGOLIN_OIDC_SECRET=${PANGOLIN_OIDC_SECRET}
PANGOLIN_API_URL=http://pangolin:3001/api/v1
PANGOLIN_API_KEY=
PANGOLIN_ORG_ID=
GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
WORKER_URL=
EOF

ok "Generated .env with fresh secrets"

# ── Generate Pangolin config ──────────────────────────────────────────────
info "Generating Pangolin config..."
mkdir -p config/pangolin

if [[ -n "$DOMAIN" ]]; then
  # Domain mode — full config with base domain
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
else
  # IP-only mode — minimal config
  cat > config/pangolin/config.yml << EOF
gerbil:
  start_port: 51820
  base_endpoint: "${SERVER_IP}"

app:
  dashboard_url: "http://${SERVER_IP}:3001"
  log_level: "info"

server:
  secret: "${PANGOLIN_SECRET}"
  cors:
    origins:
      - "http://${SERVER_IP}"
      - "http://${SERVER_IP}:3001"
      - "http://${SERVER_IP}:4000"
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
    allowed_headers: ["X-CSRF-Token", "Content-Type", "Authorization"]
    credentials: true

flags:
  require_email_verification: false
  disable_signup_without_invite: true
  disable_user_create_org: false
  allow_raw_resources: true
EOF
fi

# ── Generate Dex config ───────────────────────────────────────────────────
info "Generating Dex config..."
mkdir -p config/dex

if [[ -n "$DOMAIN" ]]; then
  DEX_ISSUER="https://fleet.${DOMAIN}/dex"
  PAWS_REDIRECT="https://fleet.${DOMAIN}/auth/callback"
  PANGOLIN_REDIRECT="https://pangolin.${DOMAIN}/auth/idp/1/oidc/callback"
else
  DEX_ISSUER="http://${SERVER_IP}:4000/dex"
  PAWS_REDIRECT="http://${SERVER_IP}:4000/auth/callback"
  PANGOLIN_REDIRECT="http://${SERVER_IP}:3001/auth/idp/1/oidc/callback"
fi

cat > config/dex/config.yaml << EOF
issuer: ${DEX_ISSUER}

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
      - ${PAWS_REDIRECT}
    secret: ${OIDC_CLIENT_SECRET}

  - id: pangolin
    name: pangolin
    redirectURIs:
      - ${PANGOLIN_REDIRECT}
    secret: ${PANGOLIN_OIDC_SECRET}

enablePasswordDB: true
EOF

# ── Generate Traefik config ───────────────────────────────────────────────
info "Generating Traefik config..."
mkdir -p config/traefik

if [[ -n "$DOMAIN" && -n "$ACME_EMAIL" ]]; then
  # Domain mode — HTTP-01 challenge (no Cloudflare needed)
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
      httpChallenge:
        entryPoint: web

providers:
  http:
    endpoint: "http://pangolin:3001/api/v1/traefik-config"
    pollInterval: "5s"
EOF
else
  # IP-only mode — no TLS
  cat > config/traefik/traefik_config.yml << EOF
api:
  insecure: true

log:
  level: INFO

entryPoints:
  web:
    address: ":80"
    transport:
      respondingTimeouts:
        readTimeout: "30s"

providers:
  http:
    endpoint: "http://pangolin:3001/api/v1/traefik-config"
    pollInterval: "5s"
EOF
fi

# ── Build and start ───────────────────────────────────────────────────────
info "Building control plane image..."
docker compose build gateway

info "Starting all services..."
docker compose up -d

# ── Print success ─────────────────────────────────────────────────────────
echo ""
echo ""
print_cat "paws is running!"

if [[ -n "$DOMAIN" ]]; then
  echo -e "  ${GREEN}Dashboard${NC}     https://fleet.${DOMAIN}"
  echo -e "  ${GREEN}Pangolin${NC}      https://pangolin.${DOMAIN}"
  echo -e "  ${GREEN}Grafana${NC}       https://grafana.${DOMAIN}"
else
  echo -e "  ${GREEN}Dashboard${NC}     http://${SERVER_IP}:4000"
  echo -e "  ${GREEN}Pangolin${NC}      http://${SERVER_IP}:3001"
fi
echo ""
echo -e "  ${CYAN}API Key${NC}       ${API_KEY}"
echo -e "  ${CYAN}Grafana Pass${NC}  ${GRAFANA_ADMIN_PASSWORD}"
echo ""

if [[ -z "$DOMAIN" ]]; then
  echo -e "${YELLOW}To add a domain later:${NC}"
  echo "  1. Point *.yourdomain.com → ${SERVER_IP} (A record)"
  echo "  2. Edit /opt/paws/.env — set DOMAIN=yourdomain.com"
  echo "  3. Run: cd /opt/paws && bash scripts/setup-control-plane.sh"
  echo ""
fi

echo -e "${YELLOW}Next steps:${NC}"
if [[ -n "$DOMAIN" ]]; then
  echo "  1. Visit https://pangolin.${DOMAIN}/auth/initial-setup"
else
  echo "  1. Visit http://${SERVER_IP}:3001/auth/initial-setup"
fi
echo "  2. Create your admin account"
echo "  3. Open the paws dashboard"
echo "  4. Follow the setup wizard to add a worker"
echo ""
echo -e "  ${CYAN}Install dir${NC}  ${PAWS_DIR}"
echo -e "  ${CYAN}Logs${NC}         cd ${PAWS_DIR} && docker compose logs -f"
echo -e "  ${CYAN}Update${NC}       cd ${PAWS_DIR} && git pull && docker compose up -d --build"
echo ""
