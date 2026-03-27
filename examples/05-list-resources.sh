#!/usr/bin/env bash
# /\_/\
# ( o.o )  list resources — sessions, daemons, fleet, snapshots
#  > ^ <
set -euo pipefail

PAWS_URL="${PAWS_URL:-http://localhost:4000}"
PAWS_API_KEY="${PAWS_API_KEY:-paws-dev-key}"

echo " /\\_/\\"
echo "( o.o )  paws resources"
echo " > ^ <"
echo ""

pretty() {
  if command -v jq &>/dev/null; then
    jq .
  else
    cat
  fi
}

fetch() {
  local label="$1" path="$2"
  echo "=== ${label} ==="
  curl -sf "${PAWS_URL}${path}" \
    -H "Authorization: Bearer ${PAWS_API_KEY}" 2>/dev/null | pretty || echo "  (failed to fetch)"
  echo ""
}

fetch "Fleet Overview"     "/v1/fleet"
fetch "Workers"            "/v1/fleet/workers"
fetch "Sessions"           "/v1/sessions"
fetch "Daemons"            "/v1/daemons"
fetch "Snapshots"          "/v1/snapshots"
