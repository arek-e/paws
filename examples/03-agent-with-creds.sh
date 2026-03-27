#!/usr/bin/env bash
# /\_/\
# ( o.o )  credential injection — API keys never enter the VM
#  > ^ <
#
# Creates a session that accesses external APIs through the TLS proxy.
# The proxy injects credentials per domain — the agent never sees the keys.
#
# Set your credentials via environment variables:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   export GITHUB_TOKEN=ghp_...
set -euo pipefail

PAWS_URL="${PAWS_URL:-http://localhost:4000}"
PAWS_API_KEY="${PAWS_API_KEY:-paws-dev-key}"
SNAPSHOT="${PAWS_SNAPSHOT:-agent-latest}"

echo " /\\_/\\"
echo "( o.o )  paws credential injection demo"
echo " > ^ <"
echo ""

# Check for credentials
if [[ -z "${ANTHROPIC_API_KEY:-}" ]] && [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "No credentials set. This example shows how credential injection works."
  echo ""
  echo "To try with real credentials:"
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  echo "  export GITHUB_TOKEN=ghp_..."
  echo ""
  echo "Running in demo mode (credentials will be placeholders)..."
  echo ""
fi

ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-sk-ant-demo-placeholder}"
GITHUB_TOKEN="${GITHUB_TOKEN:-ghp_demo-placeholder}"

# Build the credentials JSON
credentials='{
  "api.anthropic.com": {
    "headers": { "x-api-key": "'"${ANTHROPIC_API_KEY}"'" }
  },
  "github.com": {
    "headers": { "Authorization": "Bearer '"${GITHUB_TOKEN}"'" }
  },
  "*.github.com": {
    "headers": { "Authorization": "Bearer '"${GITHUB_TOKEN}"'" }
  }
}'

echo "Creating session with credential injection..."
echo "  Allowlisted domains: api.anthropic.com, github.com, *.github.com"
echo "  Credentials injected by proxy — agent sees nothing."
echo ""

response=$(curl -sf -X POST "${PAWS_URL}/v1/sessions" \
  -H "Authorization: Bearer ${PAWS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"snapshot\": \"${SNAPSHOT}\",
    \"workload\": {
      \"type\": \"script\",
      \"script\": \"echo 'Testing credential injection...' && echo '' && echo '1. Check env for secrets:' && env | grep -i 'api_key\\|token\\|secret\\|anthropic\\|github' || echo '   No secrets found in environment (as expected!)' && echo '' && echo '2. Try curl to allowlisted domain:' && curl -sf https://api.anthropic.com/v1/models 2>&1 | head -5 || echo '   (API call result depends on valid credentials)' && echo '' && echo '3. Try curl to blocked domain:' && curl -sf --connect-timeout 3 https://evil.example.com 2>&1 || echo '   Connection blocked (as expected!)' && echo '' && echo 'Zero secrets in the VM. Credentials injected at network layer.'\"
    },
    \"network\": {
      \"allowOut\": [\"api.anthropic.com\", \"github.com\", \"*.github.com\"],
      \"credentials\": ${credentials}
    },
    \"timeoutMs\": 60000
  }")

session_id=$(echo "${response}" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)

if [[ -z "${session_id}" ]]; then
  echo "Failed to create session:"
  echo "${response}"
  exit 1
fi

echo "Session created: ${session_id}"
echo ""

# Poll for result
echo "Waiting for result..."
for i in $(seq 1 60); do
  result=$(curl -sf "${PAWS_URL}/v1/sessions/${session_id}" \
    -H "Authorization: Bearer ${PAWS_API_KEY}" 2>/dev/null || echo '{}')

  status=$(echo "${result}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  case "${status}" in
    completed)
      echo ""
      echo "--- Session output ---"
      if command -v jq &>/dev/null; then
        echo "${result}" | jq -r '.stdout // .result // .'
      else
        echo "${result}"
      fi
      echo "--- End output ---"
      exit 0
      ;;
    failed)
      echo ""
      echo "Session failed:"
      echo "${result}"
      exit 1
      ;;
    *)
      printf "\r  Status: %-20s (%ds)" "${status:-pending}" "${i}"
      sleep 1
      ;;
  esac
done

echo ""
echo "Timed out waiting for session ${session_id}"
exit 1
