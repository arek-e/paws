#!/usr/bin/env bash
# /\_/\
# ( o.o )  hello world — run a script in an isolated VM
#  > ^ <
#
# Creates a session that runs a simple script inside a Firecracker VM.
# The VM boots from snapshot in <1s, runs the script, and is destroyed.
set -euo pipefail

PAWS_URL="${PAWS_URL:-http://localhost:4000}"
PAWS_API_KEY="${PAWS_API_KEY:-paws-dev-key}"
SNAPSHOT="${PAWS_SNAPSHOT:-agent-latest}"

echo " /\_/\\"
echo "( o.o )  paws hello world"
echo " > ^ <"
echo ""

# Create a session
echo "Creating session..."

body=$(cat <<JSON
{
  "snapshot": "${SNAPSHOT}",
  "workload": {
    "type": "script",
    "script": "echo 'Hello from paws!' && echo '' && echo 'System info:' && uname -a && echo '' && echo 'Uptime:' && uptime && echo '' && echo 'Memory:' && free -h | head -2"
  },
  "network": {
    "allowOut": []
  }
}
JSON
)

response=$(curl -s -w "\n%{http_code}" -X POST "${PAWS_URL}/v1/sessions" \
  -H "Authorization: Bearer ${PAWS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${body}")

http_code=$(echo "${response}" | tail -1)
result=$(echo "${response}" | sed '$d')

if [[ "${http_code}" != "202" ]]; then
  echo "Failed to create session (HTTP ${http_code}):"
  echo "${result}"
  exit 1
fi

# Extract session ID
if command -v jq &>/dev/null; then
  session_id=$(echo "${result}" | jq -r '.sessionId')
else
  session_id=$(echo "${result}" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
fi

echo "Session created: ${session_id}"
echo ""

# Poll for result
echo "Waiting for result..."
for i in $(seq 1 60); do
  poll=$(curl -s "${PAWS_URL}/v1/sessions/${session_id}" \
    -H "Authorization: Bearer ${PAWS_API_KEY}" 2>/dev/null || echo '{}')

  if command -v jq &>/dev/null; then
    status=$(echo "${poll}" | jq -r '.status // "pending"')
  else
    status=$(echo "${poll}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    status="${status:-pending}"
  fi

  case "${status}" in
    completed)
      echo ""
      echo "--- Session output ---"
      if command -v jq &>/dev/null; then
        echo "${poll}" | jq -r '.stdout // .result // .'
      else
        echo "${poll}"
      fi
      echo "--- End output ---"
      echo ""
      echo "Session ${session_id} completed."
      exit 0
      ;;
    failed|timeout)
      echo ""
      echo "Session ${status}:"
      echo "${poll}"
      exit 1
      ;;
    *)
      printf "\r  Status: %-20s (%ds)" "${status}" "${i}"
      sleep 1
      ;;
  esac
done

echo ""
echo "Timed out waiting for session ${session_id}"
exit 1
