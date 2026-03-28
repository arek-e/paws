#!/bin/bash
# /\_/\
# ( o.o )  rollback a snapshot to the previous local version
#  > ^ <
#
# Usage: sudo scripts/rollback-snapshot.sh <snapshot-id>
#
# Rolls back to the previous local snapshot version by renaming directories.
# Fast -- no download needed. Only works if the previous version is still on disk.
#
# The current snapshot is moved to <id>.rollback.<timestamp> and the most recent
# backup (*.bak.*) is restored in its place.

set -euo pipefail

# --- Configuration -----------------------------------------------------------

PAWS_DATA_DIR="${PAWS_DATA_DIR:-/var/lib/paws}"
SNAPSHOT_DIR="${PAWS_DATA_DIR}/snapshots"

# --- Colors / helpers --------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[paws]${NC} $*"; }
warn()  { echo -e "${YELLOW}[paws]${NC} $*"; }
error() { echo -e "${RED}[paws]${NC} $*" >&2; }

die() { error "$@"; exit 1; }

# --- Main --------------------------------------------------------------------

main() {
  echo ""
  echo " /\\_/\\"
  echo "( o.o )  paws snapshot rollback"
  echo " > ^ <"
  echo ""

  local id="${1:-}"

  if [[ -z "${id}" ]]; then
    echo "Usage: sudo $0 <snapshot-id>"
    echo ""
    echo "Available snapshots:"
    if [[ -d "${SNAPSHOT_DIR}" ]]; then
      ls -1d "${SNAPSHOT_DIR}"/*/ 2>/dev/null | while read -r dir; do
        local name
        name="$(basename "${dir}")"
        # Skip backup directories
        [[ "${name}" == *.bak.* ]] && continue
        [[ "${name}" == *.rollback.* ]] && continue
        echo "  ${name}"
      done
    else
      echo "  (none -- ${SNAPSHOT_DIR} does not exist)"
    fi
    echo ""
    echo "Available backups:"
    if [[ -d "${SNAPSHOT_DIR}" ]]; then
      ls -1d "${SNAPSHOT_DIR}"/*.bak.* 2>/dev/null | while read -r dir; do
        local name
        name="$(basename "${dir}")"
        echo "  ${name}"
      done || echo "  (none)"
    fi
    exit 1
  fi

  local current="${SNAPSHOT_DIR}/${id}"

  if [[ ! -d "${current}" ]]; then
    die "Snapshot not found: ${current}"
  fi

  # Find the most recent backup
  local latest_backup=""
  latest_backup="$(ls -1d "${SNAPSHOT_DIR}/${id}.bak."* 2>/dev/null | sort -V | tail -1 || true)"

  if [[ -z "${latest_backup}" ]] || [[ ! -d "${latest_backup}" ]]; then
    die "No backup found for '${id}'. Nothing to roll back to."
  fi

  info "Current snapshot: ${current}"
  info "Rolling back to:  ${latest_backup}"

  # Verify the backup has the required files
  for f in disk.ext4 memory.snap vmstate.snap; do
    if [[ ! -f "${latest_backup}/${f}" ]]; then
      die "Backup is incomplete: missing ${latest_backup}/${f}"
    fi
  done

  # Move current out of the way
  local rollback_name="${current}.rollback.$(date +%Y%m%d%H%M%S)"
  info "Moving current to: ${rollback_name}"
  mv "${current}" "${rollback_name}"

  # Move backup into place
  info "Restoring backup..."
  mv "${latest_backup}" "${current}"

  # Verify
  for f in disk.ext4 memory.snap vmstate.snap; do
    if [[ ! -f "${current}/${f}" ]]; then
      error "Rollback verification failed: ${current}/${f} missing"
      warn "Attempting to undo rollback..."
      mv "${current}" "${latest_backup}"
      mv "${rollback_name}" "${current}"
      die "Rollback failed and was reverted"
    fi
  done

  local total
  total="$(du -sh "${current}" | cut -f1)"

  echo ""
  info "Rollback complete!"
  info "  Active: ${current} (${total})"
  info "  Rolled-back version saved at: ${rollback_name}"
  echo ""
  info "To undo this rollback:"
  info "  mv ${current} ${current}.bak.undo"
  info "  mv ${rollback_name} ${current}"
  echo ""
}

main "$@"
