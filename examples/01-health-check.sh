#!/usr/bin/env bash
# /\_/\
# ( o.o )  health check — verify gateway and worker are running
#  > ^ <
set -euo pipefail

PAWS_URL="${PAWS_URL:-http://localhost:4000}"
PAWS_API_KEY="${PAWS_API_KEY:-paws-dev-key}"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo " /\\_/\\"
echo "( o.o )  paws health check"
echo " > ^ <"
echo ""

# Check gateway health
echo -n "Gateway (${PAWS_URL})... "
if health=$(curl -sf "${PAWS_URL}/health" 2>/dev/null); then
  echo -e "${GREEN}OK${NC}"
  echo "  ${health}" | head -1
else
  echo -e "${RED}FAILED${NC}"
  echo "  Could not reach gateway at ${PAWS_URL}"
  echo "  Start with: bun run start"
  exit 1
fi

echo ""

# Check fleet (shows worker connectivity)
echo -n "Fleet status... "
if fleet=$(curl -sf "${PAWS_URL}/v1/fleet" \
  -H "Authorization: Bearer ${PAWS_API_KEY}" 2>/dev/null); then
  echo -e "${GREEN}OK${NC}"
  echo "  ${fleet}"
else
  echo -e "${RED}FAILED${NC}"
  echo "  Could not fetch fleet status (check API_KEY)"
  exit 1
fi

echo ""
echo -e "${GREEN}All systems operational.${NC}"
