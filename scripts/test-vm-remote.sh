#!/usr/bin/env bash
# /\_/\
# ( o.o )  VM tests on remote Firecracker server
#  > ^ <
#
# Syncs code to the staging server and runs Tier 3 VM tests.
#
# Usage:
#   bun run test:vm:remote                    # Run VM tests (uses cached snapshot)
#   bun run test:vm:remote --rebuild-snapshot  # Rebuild test snapshot first
#
# Requirements:
#   - Tailscale connected to tailnet
#   - SSH access to root@teampitch-fc-staging
#   - Firecracker + test snapshot on staging server

set -euo pipefail

REMOTE_HOST="root@teampitch-fc-staging"
REMOTE_DIR="/tmp/paws"
SNAPSHOT_DIR="/var/lib/paws/snapshots/test-minimal"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[vm-test]${NC} $*"; }
warn() { echo -e "${YELLOW}[vm-test]${NC} $*"; }
error() { echo -e "${RED}[vm-test]${NC} $*" >&2; }

# Check SSH connectivity
check_ssh() {
  info "Checking SSH connectivity to ${REMOTE_HOST}..."
  if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "${REMOTE_HOST}" true 2>/dev/null; then
    error "Cannot reach ${REMOTE_HOST}. Is Tailscale connected?"
    exit 1
  fi
  info "SSH connection OK"
}

# Sync code to remote
sync_code() {
  info "Syncing code to ${REMOTE_HOST}:${REMOTE_DIR}..."
  rsync -az --delete \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=dist \
    --exclude=.turbo \
    "$(git rev-parse --show-toplevel)/" \
    "${REMOTE_HOST}:${REMOTE_DIR}/"
  info "Sync complete"
}

# Rebuild test snapshot on remote
rebuild_snapshot() {
  warn "Rebuilding test snapshot (this may take a few minutes)..."
  ssh "${REMOTE_HOST}" bash -s <<'SCRIPT'
    set -euo pipefail
    SNAPSHOT_DIR="/var/lib/paws/snapshots/test-minimal"
    mkdir -p "${SNAPSHOT_DIR}"

    echo "TODO: Implement snapshot build from minimal Ubuntu image"
    echo "Snapshot directory: ${SNAPSHOT_DIR}"
    echo "Expected files: disk.ext4, memory.snap, vmstate.snap"

    # Placeholder — actual snapshot build requires:
    # 1. Boot fresh VM from base kernel + rootfs
    # 2. Wait for SSH
    # 3. Pause VM
    # 4. Save memory + vmstate + disk
    # 5. Checksum all files
    echo "Snapshot rebuild not yet implemented — using existing snapshot"
SCRIPT
  info "Snapshot rebuild complete"
}

# Install dependencies on remote
install_deps() {
  info "Installing dependencies on remote..."
  ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && bun install --frozen-lockfile 2>&1 | tail -3"
  info "Dependencies installed"
}

# Run VM tests
run_tests() {
  info "Running Tier 3 VM tests on ${REMOTE_HOST}..."
  echo ""
  ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && bun test:vm"
  local exit_code=$?
  echo ""
  if [ ${exit_code} -eq 0 ]; then
    info "All VM tests passed!"
  else
    error "VM tests failed with exit code ${exit_code}"
  fi
  return ${exit_code}
}

# Main
main() {
  echo ""
  echo " /\\_/\\"
  echo "( o.o )  paws VM test runner"
  echo " > ^ <"
  echo ""

  local rebuild=false
  for arg in "$@"; do
    case "${arg}" in
      --rebuild-snapshot) rebuild=true ;;
      --help|-h)
        echo "Usage: $0 [--rebuild-snapshot]"
        echo ""
        echo "Options:"
        echo "  --rebuild-snapshot  Rebuild the test-minimal snapshot before running tests"
        exit 0
        ;;
      *)
        error "Unknown argument: ${arg}"
        exit 1
        ;;
    esac
  done

  check_ssh
  sync_code

  if [ "${rebuild}" = true ]; then
    rebuild_snapshot
  fi

  install_deps
  run_tests
}

main "$@"
