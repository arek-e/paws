#!/bin/bash
# /\_/\
# ( o.o )  generate SDKs from the OpenAPI spec
#  > ^ <
#
# Usage:
#   scripts/generate-sdks.sh [--python] [--all]
#
# Requires: npx (for @openapitools/openapi-generator-cli)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SPEC_PATH="${PROJECT_ROOT}/docs/openapi.json"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${GREEN}[paws]${NC} $*"; }
step() { echo -e "\n${CYAN}[paws]${NC} === $* ===\n"; }

# --- Refresh OpenAPI spec ---
step "Extracting OpenAPI spec from gateway"
bun "${SCRIPT_DIR}/generate-openapi.ts" "${SPEC_PATH}"

# --- Parse args ---
GEN_PYTHON=false

if [[ $# -eq 0 ]] || [[ "$1" == "--all" ]]; then
  GEN_PYTHON=true
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --python) GEN_PYTHON=true ;;
    --all) GEN_PYTHON=true ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
  shift
done

# --- Generate Python SDK ---
if [[ "${GEN_PYTHON}" == true ]]; then
  step "Generating Python SDK"

  PYTHON_OUT="${PROJECT_ROOT}/sdks/python"
  mkdir -p "${PYTHON_OUT}"

  npx @openapitools/openapi-generator-cli generate \
    -i "${SPEC_PATH}" \
    -g python \
    -o "${PYTHON_OUT}" \
    --additional-properties=packageName=paws_client,projectName=paws-client,packageVersion=0.1.0 \
    --skip-validate-spec \
    2>&1 | tail -5

  info "Python SDK generated at ${PYTHON_OUT}"
fi

# --- Done ---
echo ""
echo " /\\_/\\"
echo "( o.o )  SDK generation complete!"
echo " > ^ <"
echo ""
