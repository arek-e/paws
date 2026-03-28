#!/bin/bash
# /\_/\
# ( o.o )  paws worker setup
#  > ^ <
#
# Sets up a bare metal server as a paws worker with Newt tunnel agent.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/arek-e/paws/main/scripts/setup-worker.sh | bash
#
# Or with arguments (for automated provisioning):
#   ./scripts/setup-worker.sh --site-id SITE_ID --site-secret SECRET --endpoint https://pangolin.example.com
#
# What it does:
#   1. Installs Newt (Pangolin tunnel agent)
#   2. Creates a systemd service for Newt
#   3. Installs Bun runtime
#   4. Clones paws and installs dependencies
#   5. Installs Firecracker
#   6. Creates a systemd service for the paws worker
#   7. Starts both services

set -euo pipefail

# --- Parse arguments ---
SITE_ID=""
SITE_SECRET=""
ENDPOINT=""
WORKER_PORT="${WORKER_PORT:-3000}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --site-id) SITE_ID="$2"; shift 2 ;;
    --site-secret) SITE_SECRET="$2"; shift 2 ;;
    --endpoint) ENDPOINT="$2"; shift 2 ;;
    --port) WORKER_PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Interactive prompts if not provided ---
if [[ -z "$SITE_ID" ]]; then
  read -rp "Pangolin Site ID: " SITE_ID
fi
if [[ -z "$SITE_SECRET" ]]; then
  read -rp "Pangolin Site Secret: " SITE_SECRET
fi
if [[ -z "$ENDPOINT" ]]; then
  read -rp "Pangolin Endpoint URL (e.g., https://tunnel.example.com): " ENDPOINT
fi

if [[ -z "$SITE_ID" || -z "$SITE_SECRET" || -z "$ENDPOINT" ]]; then
  echo "Error: --site-id, --site-secret, and --endpoint are required"
  exit 1
fi

echo ""
echo " /\\_/\\"
echo "( o.o )  setting up paws worker"
echo " > ^ <"
echo ""

# --- Install Newt ---
echo "==> Installing Newt tunnel agent..."
if ! command -v newt &>/dev/null; then
  curl -fsSL https://static.pangolin.net/get-newt.sh | bash
else
  echo "    Newt already installed"
fi

# --- Create Newt systemd service ---
echo "==> Creating Newt systemd service..."
cat > /etc/systemd/system/paws-newt.service << EOF
[Unit]
Description=Paws Newt Tunnel Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/newt --id ${SITE_ID} --secret ${SITE_SECRET} --endpoint ${ENDPOINT}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

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
After=network-online.target paws-newt.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/paws
Environment=PORT=${WORKER_PORT}
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
systemctl enable --now paws-newt
systemctl enable --now paws-worker

echo ""
echo " /\\_/\\"
echo "( ^.^ )  worker setup complete!"
echo " > ^ <"
echo ""
echo "Newt:   systemctl status paws-newt"
echo "Worker: systemctl status paws-worker"
echo "Logs:   journalctl -u paws-newt -f"
echo "        journalctl -u paws-worker -f"
