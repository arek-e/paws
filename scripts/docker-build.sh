#!/usr/bin/env bash
# /\_/\
# ( o.o )  Build paws Docker images with version metadata
#  > ^ <
set -euo pipefail

PAWS_VERSION="${PAWS_VERSION:-$(grep -o '"version": "[^"]*"' package.json | head -1 | cut -d'"' -f4)}"
PAWS_COMMIT="${PAWS_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
PAWS_BUILD_DATE="${PAWS_BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

export PAWS_VERSION PAWS_COMMIT PAWS_BUILD_DATE

echo "Building paws ${PAWS_VERSION} (${PAWS_COMMIT}) at ${PAWS_BUILD_DATE}"

docker compose build "$@"

echo "Done. Verify: docker compose up -d && curl -s localhost:3000/version | jq"
