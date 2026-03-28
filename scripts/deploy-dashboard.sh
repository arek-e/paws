#!/bin/bash
# /\_/\
# ( o.o )  build + deploy dashboard via gateway
#  > ^ <
#
# Builds the dashboard and copies the dist to the server.
# The gateway serves static files when DASHBOARD_DIR is set.
#
# Usage:
#   scripts/deploy-dashboard.sh                    # build only
#   scripts/deploy-dashboard.sh --deploy           # build + rsync to server
#   scripts/deploy-dashboard.sh --deploy --tunnel  # + set up cloudflared tunnel

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DASHBOARD_DIR="${PROJECT_ROOT}/apps/dashboard"
SERVER="root@teampitch-fc-staging"
REMOTE_DIR="/opt/paws/dashboard"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${GREEN}[paws]${NC} $*"; }
step() { echo -e "\n${CYAN}[paws]${NC} === $* ===\n"; }

# --- Build ---
step "Building dashboard"
cd "${DASHBOARD_DIR}"
bunx vite build
info "Built to ${DASHBOARD_DIR}/dist/"
info "Size: $(du -sh dist | cut -f1)"

# --- Deploy ---
DO_DEPLOY=false
DO_TUNNEL=false

for arg in "$@"; do
  case "$arg" in
    --deploy) DO_DEPLOY=true ;;
    --tunnel) DO_TUNNEL=true ;;
  esac
done

if [[ "${DO_DEPLOY}" == true ]]; then
  step "Deploying to ${SERVER}"

  ssh "${SERVER}" "mkdir -p ${REMOTE_DIR}"
  rsync -avz --delete dist/ "${SERVER}:${REMOTE_DIR}/"

  info "Dashboard deployed to ${REMOTE_DIR}/"
  info ""
  info "Set on the server:"
  info "  export DASHBOARD_DIR=${REMOTE_DIR}"
  info "  # then restart the gateway"
fi

if [[ "${DO_TUNNEL}" == true ]]; then
  step "Cloudflare Tunnel setup"
  info "Run these on the server:"
  info ""
  info "  # Install cloudflared"
  info "  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared"
  info "  chmod +x /usr/local/bin/cloudflared"
  info ""
  info "  # Create tunnel"
  info "  cloudflared tunnel login"
  info "  cloudflared tunnel create paws-fleet"
  info "  cloudflared tunnel route dns paws-fleet fleet.tpops.dev"
  info ""
  info "  # Copy config"
  info "  cp infra/cloudflare/tunnel-config.yml ~/.cloudflared/config.yml"
  info "  # Edit config.yml: replace <TUNNEL_ID> with the ID from 'tunnel create'"
  info ""
  info "  # Run tunnel"
  info "  cloudflared tunnel run paws-fleet"
fi

# --- Done ---
echo ""
echo " /\\_/\\"
echo "( o.o )  dashboard ready!"
echo " > ^ <"
echo ""
if [[ "${DO_DEPLOY}" != true ]]; then
  info "Local test: DASHBOARD_DIR=${DASHBOARD_DIR}/dist bun run apps/gateway/src/server.ts"
  info "Deploy:     scripts/deploy-dashboard.sh --deploy"
fi
