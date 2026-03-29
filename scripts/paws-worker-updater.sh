#!/bin/bash
# /\_/\
# ( o.o )  paws worker self-updater
#  > ^ <
#
# Checks the control plane for a newer version and updates the worker.
# Runs as a systemd timer (every 5 minutes).
#
# The control plane is the source of truth for versions — it polls GitHub
# Releases and workers check the control plane. Workers never hit GitHub directly.

set -euo pipefail

PAWS_DIR="${PAWS_DIR:-/opt/paws}"
GITHUB_REPO="arek-e/paws"
GATEWAY_URL="${GATEWAY_URL:-}"
LOG_PREFIX="[paws-updater]"

log() { echo "${LOG_PREFIX} $1"; }
error() { echo "${LOG_PREFIX} ERROR: $1" >&2; }

# Read current version
CURRENT_VERSION=$(cat "${PAWS_DIR}/VERSION" 2>/dev/null || echo "0.0.0")

# Try to get latest version from control plane
LATEST_VERSION=""
if [[ -n "$GATEWAY_URL" ]]; then
  LATEST_VERSION=$(curl -sf "${GATEWAY_URL}/v1/version" 2>/dev/null | grep -o '"latest":"[^"]*"' | cut -d'"' -f4 || true)
fi

# Fall back to GitHub API if control plane unreachable
if [[ -z "$LATEST_VERSION" ]]; then
  TAG=$(curl -sf "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep -o '"tag_name":"[^"]*"' | cut -d'"' -f4 || true)
  LATEST_VERSION="${TAG#v}"
fi

if [[ -z "$LATEST_VERSION" ]]; then
  log "Could not determine latest version, skipping"
  exit 0
fi

if [[ "$LATEST_VERSION" == "$CURRENT_VERSION" ]]; then
  log "Up to date (v${CURRENT_VERSION})"
  exit 0
fi

log "Update available: v${CURRENT_VERSION} → v${LATEST_VERSION}"

# Download release tarball
TARBALL_URL="https://github.com/${GITHUB_REPO}/releases/download/v${LATEST_VERSION}/paws-v${LATEST_VERSION}.tar.gz"
TMP_DIR=$(mktemp -d)
NEW_DIR="/opt/paws-new"

log "Downloading v${LATEST_VERSION}..."
if ! curl -fSL "$TARBALL_URL" -o "${TMP_DIR}/paws.tar.gz" 2>/dev/null; then
  error "Failed to download release tarball"
  rm -rf "$TMP_DIR"
  exit 1
fi

# Extract to staging directory
log "Extracting..."
rm -rf "$NEW_DIR"
mkdir -p "$NEW_DIR"
tar -xzf "${TMP_DIR}/paws.tar.gz" -C "$NEW_DIR"
rm -rf "$TMP_DIR"

# Install dependencies
if command -v bun &>/dev/null && [[ -f "${NEW_DIR}/package.json" ]]; then
  log "Installing dependencies..."
  cd "$NEW_DIR" && bun install --production 2>/dev/null || true
fi

# Atomic swap
log "Swapping directories..."
OLD_DIR="/opt/paws-old"
rm -rf "$OLD_DIR"
mv "$PAWS_DIR" "$OLD_DIR"
mv "$NEW_DIR" "$PAWS_DIR"

# Preserve config from old installation
[[ -f "${OLD_DIR}/.env" ]] && cp "${OLD_DIR}/.env" "${PAWS_DIR}/.env" 2>/dev/null || true
[[ -d "${OLD_DIR}/config" ]] && cp -r "${OLD_DIR}/config" "${PAWS_DIR}/" 2>/dev/null || true

# Restart worker
log "Restarting paws-worker..."
systemctl restart paws-worker

# Verify health
sleep 5
if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then
  log "Updated to v${LATEST_VERSION}"
  rm -rf "$OLD_DIR"
else
  # Rollback
  error "Health check failed! Rolling back..."
  rm -rf "$PAWS_DIR"
  mv "$OLD_DIR" "$PAWS_DIR"
  systemctl restart paws-worker
  sleep 3
  if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then
    log "Rollback successful, still on v${CURRENT_VERSION}"
  else
    error "Rollback failed! Manual intervention needed."
  fi
  exit 1
fi
