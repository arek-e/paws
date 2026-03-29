#!/bin/bash
# /\_/\
# ( o.o )  paws one-line installer
#  > ^ <
#
# Usage:
#   curl -fsSL https://getpaws.dev/install.sh | bash
#
# Or with a domain:
#   curl -fsSL https://getpaws.dev/install.sh | bash -s -- --domain tpops.dev
#
# What it does:
#   1. Installs Docker + Docker Compose (if missing)
#   2. Downloads the latest paws release (no git clone needed)
#   3. Generates all secrets and configs
#   4. Pulls pre-built Docker images and starts the stack
#   5. Installs the 'paws' CLI for updates
#
# Requirements:
#   - Linux (Ubuntu/Debian/Fedora/CentOS)
#   - Root access
#   - Ports 80, 443, 51820/udp open
#
# Domain setup (do this AFTER install, or before):
#   Point *.yourdomain.com → your server's IP (A record)
#   TLS certificates are provisioned automatically via Let's Encrypt.
#   No Cloudflare account needed.

set -euo pipefail

PAWS_DIR="/opt/paws"
GITHUB_REPO="arek-e/paws"

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
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) ACME_EMAIL="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
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
  else
    warn "Point *.${DOMAIN} → ${SERVER_IP} for HTTPS to work"
  fi
else
  TUNNEL_DOMAIN=""
  ACME_EMAIL=""
  info "No domain — running on http://${SERVER_IP}"
fi

# ── Determine version ────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  info "Fetching latest release..."
  VERSION=$(curl -sf "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep -o '"tag_name":"[^"]*"' | cut -d'"' -f4 || true)
  VERSION="${VERSION#v}"
fi

if [[ -z "$VERSION" ]]; then
  # No releases yet — fall back to cloning the repo
  warn "No releases found. Falling back to git clone (development mode)."
  if ! command -v git &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq git || yum install -y git || true
  fi
  if [[ -d "${PAWS_DIR}/.git" ]]; then
    cd "$PAWS_DIR" && git pull origin main || true
  else
    git clone --depth 1 https://github.com/${GITHUB_REPO}.git "$PAWS_DIR"
  fi
  cd "$PAWS_DIR"
else
  # Download release tarball (no git needed)
  info "Downloading paws v${VERSION}..."
  TARBALL_URL="https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/paws-v${VERSION}.tar.gz"
  mkdir -p "$PAWS_DIR"

  if curl -fSL "$TARBALL_URL" -o /tmp/paws-release.tar.gz 2>/dev/null; then
    tar -xzf /tmp/paws-release.tar.gz -C "$PAWS_DIR"
    rm -f /tmp/paws-release.tar.gz
    ok "Downloaded paws v${VERSION}"
  else
    # Tarball not available — fall back to git clone
    warn "Release tarball not found. Falling back to git clone."
    if ! command -v git &>/dev/null; then
      apt-get update -qq && apt-get install -y -qq git || yum install -y git || true
    fi
    if [[ -d "${PAWS_DIR}/.git" ]]; then
      cd "$PAWS_DIR" && git pull origin main || true
    else
      git clone --depth 1 https://github.com/${GITHUB_REPO}.git "$PAWS_DIR"
    fi
  fi
  cd "$PAWS_DIR"
fi

ok "paws at ${PAWS_DIR}"

# ── Generate secrets ──────────────────────────────────────────────────────
info "Generating configuration..."

API_KEY=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -hex 32)
OIDC_CLIENT_SECRET=$(openssl rand -hex 24)
PANGOLIN_SECRET=$(openssl rand -hex 32)
PANGOLIN_OIDC_SECRET=$(openssl rand -hex 24)
GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)

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
LLM_GATEWAY=
LLM_GATEWAY_URL=
LLM_GATEWAY_KEY=
WORKER_URL=
EOF

ok "Generated .env with fresh secrets"

# ── Run setup (generates Pangolin, Dex, Traefik configs) ──────────────────
if [[ -f scripts/setup-control-plane.sh ]]; then
  info "Running setup..."
  bash scripts/setup-control-plane.sh
else
  # Tarball mode — configs should be generated here
  info "Pulling Docker images..."
  docker compose pull 2>/dev/null || docker compose build 2>/dev/null || true
  info "Starting services..."
  docker compose up -d
fi

# ── Install 'paws' CLI ────────────────────────────────────────────────────
if [[ -f scripts/update.sh ]]; then
  cp scripts/update.sh /usr/local/bin/paws
  chmod +x /usr/local/bin/paws
  ok "Installed 'paws' CLI to /usr/local/bin/paws"
fi

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
fi
echo ""
echo -e "  ${CYAN}API Key${NC}       ${API_KEY}"
echo -e "  ${CYAN}Grafana Pass${NC}  ${GRAFANA_ADMIN_PASSWORD}"
echo -e "  ${CYAN}Version${NC}       v${VERSION:-dev}"
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
echo -e "  ${CYAN}Update${NC}       paws update"
echo -e "  ${CYAN}Version${NC}      paws version"
echo -e "  ${CYAN}Logs${NC}         cd ${PAWS_DIR} && docker compose logs -f"
echo ""
