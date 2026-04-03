#!/bin/bash
# /\_/\
# ( o.o )  paws worker setup
#  > ^ <
#
# Usage (enrollment token — recommended):
#   curl -fsSL https://raw.githubusercontent.com/arek-e/paws/main/scripts/setup-worker.sh | bash -s -- \
#     --gateway-url https://fleet.example.com --enrollment-token enroll-abc123
#
# Usage (existing API key):
#   ./scripts/setup-worker.sh --gateway-url https://fleet.example.com --api-key YOUR_KEY

set -euo pipefail

GATEWAY_URL="" API_KEY="" ENROLLMENT_TOKEN="" WORKER_NAME="" WORKER_PORT="${WORKER_PORT:-3000}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --gateway-url) GATEWAY_URL="$2"; shift 2 ;;
    --api-key) API_KEY="$2"; shift 2 ;;
    --enrollment-token) ENROLLMENT_TOKEN="$2"; shift 2 ;;
    --name) WORKER_NAME="$2"; shift 2 ;;
    --port) WORKER_PORT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

[[ -z "$GATEWAY_URL" ]] && read -rp "Control plane URL: " GATEWAY_URL
[[ -z "$ENROLLMENT_TOKEN" && -z "$API_KEY" ]] && read -rp "Enrollment token: " ENROLLMENT_TOKEN
[[ -z "$GATEWAY_URL" ]] && { echo "Error: --gateway-url required"; exit 1; }
[[ -z "$ENROLLMENT_TOKEN" && -z "$API_KEY" ]] && { echo "Error: --enrollment-token or --api-key required"; exit 1; }
WORKER_NAME="${WORKER_NAME:-$(hostname)}"

echo -e "\n /\\_/\\\\\n( o.o )  setting up paws worker\n > ^ <\n"

# --- Enroll (exchange one-time token for permanent API key) ---
if [[ -n "$ENROLLMENT_TOKEN" ]]; then
  echo "==> Enrolling with control plane..."
  RESP=$(curl -sfS -X POST "${GATEWAY_URL}/v1/workers/enroll" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"${ENROLLMENT_TOKEN}\",\"name\":\"${WORKER_NAME}\"}" 2>&1) || {
    echo "Enrollment failed: ${RESP}"; exit 1
  }
  API_KEY=$(echo "$RESP" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
  [[ -z "$API_KEY" ]] && { echo "Failed to get API key: ${RESP}"; exit 1; }
  echo "    Enrolled: ${WORKER_NAME}"
fi

[[ -e /dev/kvm ]] || echo "WARNING: /dev/kvm not found — VMs won't work"

echo "==> Installing Bun..."
command -v bun &>/dev/null || { curl -fsSL https://bun.sh/install | bash; export PATH="$PATH:$HOME/.bun/bin"; }

echo "==> Cloning paws..."
[[ -d /opt/paws ]] && { cd /opt/paws && git pull && bun install; } || { git clone https://github.com/arek-e/paws /opt/paws && cd /opt/paws && bun install; }

echo "==> Installing Firecracker..."
command -v firecracker &>/dev/null || /opt/paws/scripts/install-firecracker.sh

echo "==> Setting up SSH keys..."
mkdir -p /var/lib/paws/ssh /var/lib/paws/snapshots /var/lib/paws/vms /etc/paws
[[ -f /var/lib/paws/ssh/id_ed25519 ]] || ssh-keygen -t ed25519 -f /var/lib/paws/ssh/id_ed25519 -N "" -q

cat > /etc/paws/worker.env << EOF
GATEWAY_URL=${GATEWAY_URL}
API_KEY=${API_KEY}
WORKER_NAME=${WORKER_NAME}
PORT=${WORKER_PORT}
SNAPSHOT_DIR=/var/lib/paws/snapshots/agent-latest
VM_BASE_DIR=/var/lib/paws/vms
SSH_KEY_PATH=/var/lib/paws/ssh/id_ed25519
EOF
chmod 600 /etc/paws/worker.env

cat > /etc/systemd/system/paws-worker.service << EOF
[Unit]
Description=Paws Worker
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=/opt/paws
EnvironmentFile=/etc/paws/worker.env
ExecStart=/root/.bun/bin/bun run apps/worker/src/server.ts
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now paws-worker

echo -e "\n /\\_/\\\\\n( ^.^ )  worker ready!\n > ^ <\n"
echo "Status: systemctl status paws-worker"
echo "Logs:   journalctl -u paws-worker -f"
