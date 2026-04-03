#!/bin/bash
set -euo pipefail

# /\_/\
# ( o.o )  install agentgateway for MCP protocol handling
#  > ^ <

VERSION="${AGENTGATEWAY_VERSION:-v1.0.1}"
INSTALL_DIR="${AGENTGATEWAY_INSTALL_DIR:-/usr/local/bin}"
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY="agentgateway-${OS}-${ARCH}"
URL="https://github.com/agentgateway/agentgateway/releases/download/${VERSION}/${BINARY}"

echo "Installing agentgateway ${VERSION} (${OS}/${ARCH})..."

if command -v agentgateway &>/dev/null; then
  CURRENT=$(agentgateway --version 2>/dev/null || echo "unknown")
  echo "agentgateway already installed: ${CURRENT}"
  read -rp "Reinstall? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 0
fi

curl -fsSL -o "/tmp/agentgateway" "$URL"
chmod +x "/tmp/agentgateway"
sudo mv "/tmp/agentgateway" "${INSTALL_DIR}/agentgateway"

echo "Installed agentgateway ${VERSION} to ${INSTALL_DIR}/agentgateway"

# Create config directory
sudo mkdir -p /etc/agentgateway
sudo mkdir -p /var/lib/agentgateway

# Write base config (sessions are appended dynamically by the worker)
if [ ! -f /etc/agentgateway/config.yaml ]; then
  cat <<'YAML' | sudo tee /etc/agentgateway/config.yaml > /dev/null
# agentgateway base config — managed by paws worker
# Session-specific routes are appended/removed dynamically

config:
  adminAddr: "localhost:15000"
  readinessAddr: "0.0.0.0:15020"
  statsAddr: "0.0.0.0:15021"
  logging:
    level: "info"

binds:
  - port: 4317
    listeners:
      - name: mcp-gateway
        protocol: HTTP
        routes: []
YAML
  echo "Created base config at /etc/agentgateway/config.yaml"
fi

# Verify installation
agentgateway --version 2>/dev/null && echo "Verification: OK" || echo "Warning: agentgateway not in PATH"
