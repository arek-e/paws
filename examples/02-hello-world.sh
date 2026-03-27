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

echo " /\\_/\\"
echo "( o.o )  paws hello world"
echo " > ^ <"
echo ""

# Create a session
echo "Creating session..."
response=$(curl -sf -X POST "${PAWS_URL}/v1/sessions" \
  -H "Authorization: Bearer ${PAWS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"snapshot\": \"${SNAPSHOT}\",
    \"workload\": {
      \"type\": \"script\",
      \"script\": \"echo 'Hello from paws!' && echo '' && echo 'System info:' && uname -a && echo '' && echo 'Uptime:' && uptime && echo '' && echo 'Memory:' && free -h | head -2\"
    },
    \"network\": {
      \"allowOut\": []
    }
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
      # Pretty-print if jq is available, otherwise raw
      if command -v jq &>/dev/null; then
        echo "${result}" | jq -r '.stdout // .result // .'
      else
        echo "${result}"
      fi
      echo "--- End output ---"
      echo ""
      echo "Session ${session_id} completed successfully."
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
