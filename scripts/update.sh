#!/bin/bash
# /\_/\
# ( o.o )  paws update
#  > ^ <
#
# Usage:
#   paws update          # update to latest
#   paws update v0.5.4   # update to specific version
#   paws version         # show current version

set -euo pipefail

PAWS_DIR="${PAWS_DIR:-/opt/paws}"
GITHUB_REPO="arek-e/paws"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}==> $1${NC}"; }
ok() { echo -e "${GREEN}✓  $1${NC}"; }
error() { echo -e "${RED}✗  $1${NC}"; exit 1; }

get_current_version() {
  cat "${PAWS_DIR}/VERSION" 2>/dev/null || echo "unknown"
}

get_latest_version() {
  # Try control plane first (if running locally)
  local cp_version
  cp_version=$(curl -sf http://localhost:4000/v1/version 2>/dev/null | grep -o '"latest":"[^"]*"' | cut -d'"' -f4 || true)
  if [[ -n "$cp_version" && "$cp_version" != "0.0.0" ]]; then
    echo "$cp_version"
    return
  fi

  # Fall back to GitHub API
  local tag
  tag=$(curl -sf "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep -o '"tag_name":"[^"]*"' | cut -d'"' -f4 || true)
  echo "${tag#v}"
}

do_version() {
  local current
  current=$(get_current_version)
  echo "paws v${current}"

  local latest
  latest=$(get_latest_version)
  if [[ -n "$latest" && "$latest" != "$current" ]]; then
    echo -e "  ${CYAN}Latest: v${latest}${NC}"
    echo "  Run: paws update"
  fi
}

do_update() {
  local target_version="${1:-}"
  local current
  current=$(get_current_version)

  if [[ -z "$target_version" ]]; then
    target_version=$(get_latest_version)
  fi
  target_version="${target_version#v}"

  if [[ -z "$target_version" ]]; then
    error "Could not determine latest version. Check your internet connection."
  fi

  if [[ "$target_version" == "$current" ]]; then
    ok "Already on v${current}"
    exit 0
  fi

  info "Updating paws: v${current} → v${target_version}"

  # Download release tarball
  local tarball_url="https://github.com/${GITHUB_REPO}/releases/download/v${target_version}/paws-v${target_version}.tar.gz"
  local tmp_dir
  tmp_dir=$(mktemp -d)

  info "Downloading v${target_version}..."
  if ! curl -fSL "$tarball_url" -o "${tmp_dir}/paws.tar.gz" 2>/dev/null; then
    rm -rf "$tmp_dir"
    error "Failed to download v${target_version}. Check the version exists at: https://github.com/${GITHUB_REPO}/releases"
  fi

  # Extract (preserve user config)
  info "Extracting..."
  mkdir -p "${tmp_dir}/extract"
  tar -xzf "${tmp_dir}/paws.tar.gz" -C "${tmp_dir}/extract"

  # Backup current .env and config
  [[ -f "${PAWS_DIR}/.env" ]] && cp "${PAWS_DIR}/.env" "${tmp_dir}/.env.backup"
  [[ -d "${PAWS_DIR}/config" ]] && cp -r "${PAWS_DIR}/config" "${tmp_dir}/config.backup"

  # Replace files (keep .env, config, data volumes)
  info "Updating files..."
  for file in docker-compose.yml VERSION install.sh setup-control-plane.sh setup-worker.sh update.sh; do
    src="${tmp_dir}/extract/${file}"
    if [[ -f "$src" ]]; then
      if [[ "$file" == *.sh ]]; then
        # Scripts go to scripts/ if that dir exists
        if [[ -d "${PAWS_DIR}/scripts" ]]; then
          cp "$src" "${PAWS_DIR}/scripts/${file}"
          chmod +x "${PAWS_DIR}/scripts/${file}"
        else
          cp "$src" "${PAWS_DIR}/${file}"
          chmod +x "${PAWS_DIR}/${file}"
        fi
      else
        cp "$src" "${PAWS_DIR}/${file}"
      fi
    fi
  done

  # Restore user config
  [[ -f "${tmp_dir}/.env.backup" ]] && cp "${tmp_dir}/.env.backup" "${PAWS_DIR}/.env"
  [[ -d "${tmp_dir}/config.backup" ]] && cp -r "${tmp_dir}/config.backup/." "${PAWS_DIR}/config/"

  # Update PAWS_VERSION in .env so docker compose pulls the correct tag
  if [[ -f "${PAWS_DIR}/.env" ]]; then
    if grep -q '^PAWS_VERSION=' "${PAWS_DIR}/.env"; then
      sed -i "s/^PAWS_VERSION=.*/PAWS_VERSION=${target_version}/" "${PAWS_DIR}/.env"
    else
      echo "PAWS_VERSION=${target_version}" >> "${PAWS_DIR}/.env"
    fi
  fi

  # Pull new Docker images
  info "Pulling new images..."
  cd "$PAWS_DIR"
  PAWS_VERSION="${target_version}" docker compose pull 2>/dev/null || true

  # Restart
  info "Restarting services..."
  PAWS_VERSION="${target_version}" docker compose up -d 2>/dev/null || true

  # Cleanup
  rm -rf "$tmp_dir"

  # Health check
  info "Waiting for health check..."
  sleep 5
  local port
  port=$(grep -oP '^PORT=\K.*' "${PAWS_DIR}/.env" 2>/dev/null || echo "3000")
  if curl -sf "http://localhost:${port}/health" >/dev/null 2>&1; then
    ok "Updated to v${target_version}"
  else
    echo -e "${RED}⚠  Services restarted but health check failed. Check: docker compose logs${NC}"
  fi
}

# Main
case "${1:-update}" in
  version|--version|-v)
    do_version
    ;;
  update)
    do_update "${2:-}"
    ;;
  help|--help|-h)
    echo "Usage: paws <command>"
    echo ""
    echo "Commands:"
    echo "  update [version]  Update paws to latest or specific version"
    echo "  version           Show current version"
    echo "  help              Show this help"
    ;;
  *)
    do_update "$1"
    ;;
esac
