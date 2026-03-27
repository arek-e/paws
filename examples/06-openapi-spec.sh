#!/usr/bin/env bash
# /\_/\
# ( o.o )  fetch the auto-generated OpenAPI spec
#  > ^ <
#
# The gateway generates its OpenAPI 3.1 spec from code (Zod schemas + Hono routes).
# This spec can be used with openapi-generator to create SDKs in any language.
set -euo pipefail

PAWS_URL="${PAWS_URL:-http://localhost:4000}"

echo " /\\_/\\"
echo "( o.o )  paws OpenAPI spec"
echo " > ^ <"
echo ""

echo "Fetching OpenAPI spec from ${PAWS_URL}/openapi.json..."
echo ""

spec=$(curl -sf "${PAWS_URL}/openapi.json" 2>/dev/null)

if [[ -z "${spec}" ]]; then
  echo "Failed to fetch spec. Is the gateway running?"
  exit 1
fi

if command -v jq &>/dev/null; then
  # Show summary
  title=$(echo "${spec}" | jq -r '.info.title // "paws"')
  version=$(echo "${spec}" | jq -r '.info.version // "unknown"')
  paths=$(echo "${spec}" | jq -r '.paths | keys | length')
  echo "  Title:     ${title}"
  echo "  Version:   ${version}"
  echo "  Endpoints: ${paths}"
  echo ""
  echo "Endpoints:"
  echo "${spec}" | jq -r '.paths | to_entries[] | "  \(.key)"'
  echo ""
  echo "Full spec saved to openapi.json"
  echo "${spec}" | jq . > openapi.json
else
  echo "${spec}" > openapi.json
  echo "Spec saved to openapi.json"
fi

echo ""
echo "Generate an SDK:"
echo "  npx @openapitools/openapi-generator-cli generate -i openapi.json -g typescript-fetch -o sdk/"
