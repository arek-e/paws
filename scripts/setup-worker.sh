#!/bin/bash
# /\_/\
# ( o.o )  paws worker setup
#  > ^ <
#
# Sets up a bare metal server as a paws worker.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/arek-e/paws/main/scripts/setup-worker.sh | bash
#
# Or with arguments (for automated provisioning):
#   ./scripts/setup-worker.sh --gateway-url https://fleet.example.com --api-key YOUR_KEY
#
# What it does:
#   1. Installs Bun runtime
#   2. Clones paws and installs dependencies
#   3. Installs Firecracker
#   4. Creates a systemd service for the paws worker
#   5. Starts the worker (connects to control plane via WebSocket call-home)

set -euo pipefail

# --- Parse arguments ---
GATEWAY_URL=""
API_KEY=""
WORKER_PORT="${WORKER_PORT:-3000}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --gateway-url) GATEWAY_URL="$2"; shift 2 ;;
    --api-key) API_KEY="$2"; shift 2 ;;
    --port) WORKER_PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Interactive prompts if not provided ---
if [[ -z "$GATEWAY_URL" ]]; then
  read -rp "Control plane URL (e.g., https://fleet.example.com): " GATEWAY_URL
fi
if [[ -z "$API_KEY" ]]; then
  read -rp "API key: " API_KEY
fi

if [[ -z "$GATEWAY_URL" || -z "$API_KEY" ]]; then
  echo "Error: --gateway-url and --api-key are required"
  exit 1
fi

echo ""
echo " /\_/\\"
echo "( o.o )  setting up paws worker"
echo " > ^ <"
echo ""

# --- Install Bun ---
echo "==> Installing Bun..."
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$PATH:$HOME/.bun/bin"
else
  echo "    Bun already installed"
fi

# --- Clone paws ---
echo "==> Cloning paws..."
if [[ ! -d /opt/paws ]]; then
  git clone https://github.com/arek-e/paws /opt/paws
  cd /opt/paws && bun install
else
  echo "    /opt/paws already exists, pulling latest..."
  cd /opt/paws && git pull && bun install
fi

# --- Install Firecracker ---
echo "==> Installing Firecracker..."
if ! command -v firecracker &>/dev/null; then
  /opt/paws/scripts/install-firecracker.sh
else
  echo "    Firecracker already installed"
fi

# --- Create worker systemd service ---
echo "==> Creating paws worker systemd service..."
cat > /etc/systemd/system/paws-worker.service << EOF
[Unit]
Description=Paws Worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/paws
Environment=PORT=${WORKER_PORT}
Environment=GATEWAY_URL=${GATEWAY_URL}
Environment=API_KEY=${API_KEY}
ExecStart=/root/.bun/bin/bun run apps/worker/src/server.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# --- Start services ---
echo "==> Starting services..."
systemctl daemon-reload
systemctl enable --now paws-worker

echo ""
echo " /\_/\\"
echo "( ^.^ )  worker setup complete!"
echo " > ^ <"
echo ""
echo "Worker: systemctl status paws-worker"
echo "Logs:   journalctl -u paws-worker -f"
