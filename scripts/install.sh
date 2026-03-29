#!/bin/bash
# /\_/\
# ( o.o )  paws one-line installer
#  > ^ <
#
# Usage:
#   curl -fsSL https://get.paws.dev/install.sh | bash
#
# Or with arguments:
#   curl -fsSL https://get.paws.dev/install.sh | bash -s -- \
#     --domain tpops.dev \
#     --email admin@tpops.dev \
#     --cf-token your-cloudflare-token
#
# What it does:
#   1. Installs Docker + Docker Compose (if missing)
#   2. Clones the paws repo
#   3. Asks for your domain + Cloudflare API token (or uses args)
#   4. Generates all secrets and configs
#   5. Starts the full stack (Pangolin, Traefik, Dex, Gateway, Grafana)
#   6. Prints your dashboard URL
#
# Requirements:
#   - Linux (Ubuntu/Debian recommended)
#   - Root access
#   - A domain with DNS managed by Cloudflare
#   - Wildcard DNS: *.yourdomain.com → this server's IP

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
TUNNEL_DOMAIN=""
CF_DNS_API_TOKEN=""
ACME_EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --tunnel-domain) TUNNEL_DOMAIN="$2"; shift 2 ;;
    --cf-token) CF_DNS_API_TOKEN="$2"; shift 2 ;;
    --email) ACME_EMAIL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── Welcome ────────────────────────────────────────────────────────────────
print_cat "paws installer"

echo "This will install paws on this server."
echo "You'll need:"
echo "  - A domain with Cloudflare DNS"
echo "  - A wildcard DNS record (*.domain → this server)"
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
  if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    curl -fsSL https://get.docker.com | sh
  elif [[ "$OS" == "fedora" || "$OS" == "centos" || "$OS" == "rhel" ]]; then
    curl -fsSL https://get.docker.com | sh
  else
    warn "Unknown OS — trying Docker's install script anyway"
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable docker
  systemctl start docker
  ok "Docker installed"
fi

# Verify Docker Compose
if docker compose version &>/dev/null; then
  ok "Docker Compose available"
else
  error "Docker Compose not found. Please install Docker Compose v2."
fi

# ── Interactive prompts (if args not provided) ─────────────────────────────
if [[ -z "$DOMAIN" ]]; then
  echo ""
  read -rp "$(echo -e "${CYAN}Domain${NC} (e.g., tpops.dev): ")" DOMAIN
fi

if [[ -z "$DOMAIN" ]]; then
  error "Domain is required"
fi

if [[ -z "$TUNNEL_DOMAIN" ]]; then
  TUNNEL_DOMAIN="tunnel.${DOMAIN}"
fi

if [[ -z "$ACME_EMAIL" ]]; then
  read -rp "$(echo -e "${CYAN}Email${NC} (for Let's Encrypt): ")" ACME_EMAIL
fi

if [[ -z "$ACME_EMAIL" ]]; then
  error "Email is required for Let's Encrypt certificates"
fi

if [[ -z "$CF_DNS_API_TOKEN" ]]; then
  echo ""
  echo "Cloudflare API token (for TLS certificates via DNS challenge)."
  echo "Create at: https://dash.cloudflare.com/profile/api-tokens"
  echo "Template: 'Edit zone DNS', scoped to your domain."
  echo ""
  read -rsp "$(echo -e "${CYAN}Cloudflare API Token${NC}: ")" CF_DNS_API_TOKEN
  echo ""
fi

if [[ -z "$CF_DNS_API_TOKEN" ]]; then
  error "Cloudflare API token is required"
fi

# ── Check DNS ──────────────────────────────────────────────────────────────
SERVER_IP=$(curl -s4 ifconfig.me || curl -s4 icanhazip.com || echo "unknown")
info "Server IP: ${SERVER_IP}"
info "Checking DNS for *.${DOMAIN}..."

RESOLVED_IP=$(dig +short "fleet.${DOMAIN}" 2>/dev/null | head -1 || echo "")
if [[ "$RESOLVED_IP" == "$SERVER_IP" ]]; then
  ok "DNS looks good: fleet.${DOMAIN} → ${SERVER_IP}"
elif [[ -n "$RESOLVED_IP" ]]; then
  warn "fleet.${DOMAIN} resolves to ${RESOLVED_IP} (expected ${SERVER_IP})"
  warn "Continuing anyway — make sure *.${DOMAIN} points to this server"
else
  warn "Could not resolve fleet.${DOMAIN}"
  warn "Make sure *.${DOMAIN} has an A record pointing to ${SERVER_IP}"
fi

# ── Clone or update repo ──────────────────────────────────────────────────
if [[ -d "$PAWS_DIR/.git" ]]; then
  info "Updating existing paws installation..."
  cd "$PAWS_DIR"
  git pull origin "$PAWS_BRANCH"
else
  info "Cloning paws..."
  git clone --depth 1 --branch "$PAWS_BRANCH" "$PAWS_REPO" "$PAWS_DIR"
  cd "$PAWS_DIR"
fi

ok "paws source at ${PAWS_DIR}"

# ── Generate .env ──────────────────────────────────────────────────────────
info "Generating configuration..."

API_KEY=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -hex 32)
OIDC_CLIENT_SECRET=$(openssl rand -hex 24)
PANGOLIN_SECRET=$(openssl rand -hex 32)
PANGOLIN_OIDC_SECRET=$(openssl rand -hex 24)
GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)

cat > .env << EOF
# Generated by paws installer on $(date -u +%Y-%m-%dT%H:%M:%SZ)
DOMAIN=${DOMAIN}
TUNNEL_DOMAIN=${TUNNEL_DOMAIN}
GRAFANA_DOMAIN=grafana.${DOMAIN}
CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
ACME_EMAIL=${ACME_EMAIL}
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

# ── Run setup ──────────────────────────────────────────────────────────────
info "Running setup (generating configs, building, starting services)..."
bash scripts/setup-control-plane.sh

# ── Print success ──────────────────────────────────────────────────────────
echo ""
echo ""
print_cat "paws is running!"
echo -e "  ${GREEN}Dashboard${NC}     https://fleet.${DOMAIN}"
echo -e "  ${GREEN}Pangolin${NC}      https://pangolin.${DOMAIN}"
echo -e "  ${GREEN}Grafana${NC}       https://grafana.${DOMAIN}"
echo ""
echo -e "  ${CYAN}API Key${NC}       ${API_KEY}"
echo -e "  ${CYAN}Grafana Pass${NC}  ${GRAFANA_ADMIN_PASSWORD}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Visit https://pangolin.${DOMAIN}/auth/initial-setup"
echo "  2. Create your admin account"
echo "  3. Open https://fleet.${DOMAIN} — the paws dashboard"
echo "  4. Follow the setup wizard to add a worker"
echo ""
echo -e "  ${CYAN}Install dir${NC}  ${PAWS_DIR}"
echo -e "  ${CYAN}Logs${NC}         cd ${PAWS_DIR} && docker compose logs -f"
echo -e "  ${CYAN}Update${NC}       cd ${PAWS_DIR} && git pull && docker compose up -d --build"
echo ""
