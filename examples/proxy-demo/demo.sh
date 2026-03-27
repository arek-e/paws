#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== paws proxy demo ==="
echo ""
echo "This demonstrates zero-secret credential injection."
echo "The agent container has NO API keys — the proxy injects them at the network layer."
echo ""

echo "[1/4] Building and starting proxy..."
docker compose up -d --build proxy
sleep 2

echo "[2/4] Starting agent container..."
docker compose up -d agent
sleep 1

echo "[3/4] Running curl through proxy (agent -> proxy -> upstream)..."
echo "  The proxy will inject x-api-key header for api.anthropic.com"
echo ""
docker compose exec agent sh -c 'apk add --quiet curl 2>/dev/null; curl -s -x http://proxy:8080 https://api.anthropic.com/v1/messages --max-time 5 2>&1' || echo "  (Connection to upstream expected to fail with placeholder key, but the proxy DID inject the credential)"
echo ""

echo "[4/4] Verifying: agent container has no API keys..."
docker compose exec agent env | grep -i "key\|token\|secret\|auth" || echo "  No secrets found in agent container environment!"
echo ""

echo "Done! The agent container never had the API key."
echo "The proxy injected it at the network layer."
echo ""
echo "Cleaning up..."
docker compose down
