#!/usr/bin/env bash
# /\_/\
# ( o.o )  register a daemon — persistent role with webhook trigger
#  > ^ <
#
# Registers a daemon that fires on GitHub webhook events.
# The daemon is a definition — not a running process. When a webhook
# arrives, paws creates a session, runs the workload, and destroys the VM.
set -euo pipefail

PAWS_URL="${PAWS_URL:-http://localhost:4000}"
PAWS_API_KEY="${PAWS_API_KEY:-paws-dev-key}"
SNAPSHOT="${PAWS_SNAPSHOT:-agent-latest}"
DAEMON_ROLE="${1:-pr-reviewer}"

echo " /\_/\\"
echo "( o.o )  paws daemon registration"
echo " > ^ <"
echo ""

echo "Registering daemon: ${DAEMON_ROLE}"
echo ""

# Delete existing daemon if it exists (idempotent re-runs)
curl -s -X DELETE "${PAWS_URL}/v1/daemons/${DAEMON_ROLE}" \
  -H "Authorization: Bearer ${PAWS_API_KEY}" >/dev/null 2>&1 || true

body=$(cat <<JSON
{
  "role": "${DAEMON_ROLE}",
  "description": "Automatically reviews new pull requests",
  "snapshot": "${SNAPSHOT}",
  "trigger": {
    "type": "webhook",
    "events": ["pull_request.opened", "pull_request.synchronize"]
  },
  "workload": {
    "type": "script",
    "script": "echo 'Reviewing PR from trigger payload...'"
  },
  "network": {
    "allowOut": ["api.anthropic.com", "github.com", "*.github.com"],
    "credentials": {}
  },
  "governance": {
    "maxActionsPerHour": 10,
    "auditLog": true
  }
}
JSON
)

response=$(curl -s -w "\n%{http_code}" -X POST "${PAWS_URL}/v1/daemons" \
  -H "Authorization: Bearer ${PAWS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${body}")

http_code=$(echo "${response}" | tail -1)
result=$(echo "${response}" | sed '$d')

if [[ "${http_code}" == "201" ]]; then
  if command -v jq &>/dev/null; then
    echo "${result}" | jq .
  else
    echo "${result}"
  fi
else
  echo "Failed (HTTP ${http_code}):"
  echo "${result}"
  exit 1
fi

echo ""
echo "Daemon registered. To trigger it, send a webhook:"
echo ""
echo "  curl -X POST ${PAWS_URL}/v1/webhooks/${DAEMON_ROLE} \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"action\": \"opened\", \"pull_request\": {\"number\": 42}}'"
echo ""
echo "Or point a GitHub webhook at: ${PAWS_URL}/v1/webhooks/${DAEMON_ROLE}"
