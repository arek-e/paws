#!/bin/bash
# /\_/\
# ( o.o )  build a firecracker snapshot from YAML config
#  > ^ <
#
# Builds a Firecracker VM snapshot from a YAML config file.
# With --upload, uploads the snapshot to R2 after building.
#
# Usage:
#   sudo scripts/build-snapshot.sh snapshot-configs/agent-latest.yaml
#   sudo scripts/build-snapshot.sh snapshot-configs/test-minimal.yaml --upload
#
# Requirements:
#   - /dev/kvm accessible
#   - firecracker binary in PATH or at /usr/local/bin/firecracker
#   - Root access (TAP devices, iptables)
#   - For --upload: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME

set -euo pipefail

# --- Configuration -----------------------------------------------------------

PAWS_DATA_DIR="${PAWS_DATA_DIR:-/var/lib/paws}"
FIRECRACKER_BIN="${FIRECRACKER_BIN:-$(command -v firecracker 2>/dev/null || echo /usr/local/bin/firecracker)}"
SSH_KEY="${PAWS_DATA_DIR}/ssh/id_ed25519"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o LogLevel=ERROR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Network config — use a high subnet index to avoid collisions with running VMs
BUILD_SUBNET_INDEX=16383
TAP_DEVICE="tap${BUILD_SUBNET_INDEX}"

# Compute IPs from subnet index (matching ip-pool.ts logic)
# index * 4 = base offset, then split into octets
BASE_OFFSET=$(( BUILD_SUBNET_INDEX * 4 ))
OCTET3=$(( (BASE_OFFSET >> 8) & 0xFF ))
OCTET4=$(( BASE_OFFSET & 0xFF ))
HOST_OCTET3=$(( ((BASE_OFFSET + 1) >> 8) & 0xFF ))
HOST_OCTET4=$(( (BASE_OFFSET + 1) & 0xFF ))
GUEST_OCTET3=$(( ((BASE_OFFSET + 2) >> 8) & 0xFF ))
GUEST_OCTET4=$(( (BASE_OFFSET + 2) & 0xFF ))

HOST_IP="172.16.${HOST_OCTET3}.${HOST_OCTET4}"
GUEST_IP="172.16.${GUEST_OCTET3}.${GUEST_OCTET4}"
GUEST_MAC="AA:FC:00:00:FF:FE"

# Timeouts
SSH_WAIT_TIMEOUT=60
SETUP_TIMEOUT=600

# --- Colors / helpers --------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[paws]${NC} $*"; }
warn()  { echo -e "${YELLOW}[paws]${NC} $*"; }
error() { echo -e "${RED}[paws]${NC} $*" >&2; }
step()  { echo -e "\n${CYAN}[paws]${NC} === $* ===\n"; }

die() { error "$@"; exit 1; }

# --- Cleanup trap ------------------------------------------------------------

TMPDIR=""
FC_PID=""
SOCKET_PATH=""

cleanup() {
  local exit_code=$?

  step "Cleaning up"

  # Kill firecracker process
  if [[ -n "${FC_PID}" ]]; then
    info "Killing Firecracker process (PID ${FC_PID})..."
    kill "${FC_PID}" 2>/dev/null || true
    sleep 1
    kill -9 "${FC_PID}" 2>/dev/null || true
  fi

  # Remove TAP device
  if ip link show "${TAP_DEVICE}" &>/dev/null; then
    info "Removing TAP device ${TAP_DEVICE}..."
    ip link del "${TAP_DEVICE}" 2>/dev/null || true
  fi

  # Remove iptables rules (ignore errors — rules may not exist)
  iptables -t nat -D PREROUTING -i "${TAP_DEVICE}" -p tcp --dport 80 \
    -j DNAT --to "${HOST_IP}:8080" 2>/dev/null || true
  iptables -t nat -D PREROUTING -i "${TAP_DEVICE}" -p tcp --dport 443 \
    -j DNAT --to "${HOST_IP}:8443" 2>/dev/null || true
  iptables -D FORWARD -i "${TAP_DEVICE}" -j ACCEPT 2>/dev/null || true
  iptables -D FORWARD -o "${TAP_DEVICE}" -m conntrack --ctstate RELATED,ESTABLISHED \
    -j ACCEPT 2>/dev/null || true

  # Remove socket
  if [[ -n "${SOCKET_PATH}" ]]; then
    rm -f "${SOCKET_PATH}"
  fi

  if [[ ${exit_code} -ne 0 ]]; then
    error "Build failed (exit code ${exit_code})"
    if [[ -n "${TMPDIR}" ]] && [[ -d "${TMPDIR}" ]]; then
      warn "Temp directory preserved for debugging: ${TMPDIR}"
    fi
  fi

  return ${exit_code}
}

trap cleanup EXIT

# --- Pre-flight checks -------------------------------------------------------

preflight() {
  step "Pre-flight checks"

  if [[ $EUID -ne 0 ]]; then
    die "This script must be run as root"
  fi

  if [[ ! -e /dev/kvm ]]; then
    die "/dev/kvm not found. KVM support is required."
  fi

  if [[ ! -x "${FIRECRACKER_BIN}" ]]; then
    die "Firecracker binary not found at ${FIRECRACKER_BIN}"
  fi

  if [[ ! -f "${SSH_KEY}" ]]; then
    die "SSH key not found at ${SSH_KEY}. Run install-firecracker.sh first."
  fi

  if ! command -v bun &>/dev/null; then
    die "bun not found in PATH"
  fi

  info "Firecracker: ${FIRECRACKER_BIN}"
  info "SSH key: ${SSH_KEY}"
  info "Data dir: ${PAWS_DATA_DIR}"
}

# --- Parse YAML config -------------------------------------------------------

parse_config() {
  local config_file="$1"

  step "Parsing config: ${config_file}"

  if [[ ! -f "${config_file}" ]]; then
    die "Config file not found: ${config_file}"
  fi

  # Use bun to parse YAML (avoid dependency on yq/python)
  local parsed
  parsed="$(bun -e "
    import { readFileSync } from 'fs';
    import { parse } from 'yaml';
    const config = parse(readFileSync('${config_file}', 'utf8'));
    console.log(JSON.stringify(config));
  ")" || die "Failed to parse YAML config"

  # Extract fields using bun
  SNAPSHOT_ID="$(echo "${parsed}" | bun -e "
    const config = JSON.parse(await Bun.stdin.text());
    console.log(config.id);
  ")"
  KERNEL_PATH="$(echo "${parsed}" | bun -e "
    const config = JSON.parse(await Bun.stdin.text());
    console.log(config.base.kernel);
  ")"
  ROOTFS_PATH="$(echo "${parsed}" | bun -e "
    const config = JSON.parse(await Bun.stdin.text());
    console.log(config.base.rootfs);
  ")"
  VCPU_COUNT="$(echo "${parsed}" | bun -e "
    const config = JSON.parse(await Bun.stdin.text());
    console.log(config.vcpu);
  ")"
  MEMORY_MB="$(echo "${parsed}" | bun -e "
    const config = JSON.parse(await Bun.stdin.text());
    console.log(config.memory_mb);
  ")"
  SETUP_SCRIPT="$(echo "${parsed}" | bun -e "
    const config = JSON.parse(await Bun.stdin.text());
    console.log(config.setup || '');
  ")"

  # Validate required fields
  [[ -n "${SNAPSHOT_ID}" ]] || die "Config missing 'id'"
  [[ -n "${KERNEL_PATH}" ]] || die "Config missing 'base.kernel'"
  [[ -n "${ROOTFS_PATH}" ]] || die "Config missing 'base.rootfs'"
  [[ -n "${VCPU_COUNT}" ]] || die "Config missing 'vcpu'"
  [[ -n "${MEMORY_MB}" ]] || die "Config missing 'memory_mb'"

  # Validate base files exist
  [[ -f "${KERNEL_PATH}" ]] || die "Kernel not found: ${KERNEL_PATH}"
  [[ -f "${ROOTFS_PATH}" ]] || die "Rootfs not found: ${ROOTFS_PATH}"

  info "Snapshot ID: ${SNAPSHOT_ID}"
  info "Kernel: ${KERNEL_PATH}"
  info "Rootfs: ${ROOTFS_PATH}"
  info "vCPUs: ${VCPU_COUNT}, Memory: ${MEMORY_MB} MB"
  info "Setup script: $(echo "${SETUP_SCRIPT}" | wc -l | tr -d ' ') lines"
}

# --- Prepare working directory -----------------------------------------------

prepare_workdir() {
  step "Preparing working directory"

  TMPDIR="$(mktemp -d /tmp/paws-snapshot-build-XXXXXX)"
  SOCKET_PATH="${TMPDIR}/firecracker.sock"

  info "Working directory: ${TMPDIR}"

  # Copy rootfs with CoW support
  info "Copying rootfs (CoW)..."
  cp --reflink=auto "${ROOTFS_PATH}" "${TMPDIR}/disk.ext4"

  local disk_size
  disk_size="$(du -h "${TMPDIR}/disk.ext4" | cut -f1)"
  info "Disk image: ${TMPDIR}/disk.ext4 (${disk_size})"
}

# --- Set up networking -------------------------------------------------------

setup_network() {
  step "Setting up network (TAP: ${TAP_DEVICE}, Host: ${HOST_IP}, Guest: ${GUEST_IP})"

  # Create TAP device
  ip tuntap add "${TAP_DEVICE}" mode tap
  ip addr add "${HOST_IP}/30" dev "${TAP_DEVICE}"
  ip link set "${TAP_DEVICE}" up

  # Enable forwarding for the TAP device (allow VM to reach the internet for setup)
  # During build, we allow outbound traffic so apt-get/curl work
  iptables -A FORWARD -i "${TAP_DEVICE}" -j ACCEPT
  iptables -A FORWARD -o "${TAP_DEVICE}" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

  # NAT outbound traffic from the VM through the host
  iptables -t nat -A POSTROUTING -s "${GUEST_IP}/32" -j MASQUERADE

  info "Network configured"
}

# --- Boot Firecracker VM ----------------------------------------------------

boot_vm() {
  step "Booting Firecracker VM"

  # Start Firecracker in the background
  "${FIRECRACKER_BIN}" \
    --api-sock "${SOCKET_PATH}" \
    --id build-vm &
  FC_PID=$!

  info "Firecracker started (PID: ${FC_PID})"

  # Wait for socket
  info "Waiting for API socket..."
  local attempts=0
  while [[ ! -S "${SOCKET_PATH}" ]]; do
    sleep 0.1
    attempts=$((attempts + 1))
    if [[ ${attempts} -ge 50 ]]; then
      die "Firecracker socket did not appear after 5s"
    fi
  done
  info "API socket ready"

  # Configure machine
  info "Configuring machine (${VCPU_COUNT} vCPU, ${MEMORY_MB} MB)..."
  curl --silent --unix-socket "${SOCKET_PATH}" -X PUT \
    "http://localhost/machine-config" \
    -H "Content-Type: application/json" \
    -d "{
      \"vcpu_count\": ${VCPU_COUNT},
      \"mem_size_mib\": ${MEMORY_MB}
    }" || die "Failed to configure machine"

  # Configure boot source
  info "Setting boot source..."
  curl --silent --unix-socket "${SOCKET_PATH}" -X PUT \
    "http://localhost/boot-source" \
    -H "Content-Type: application/json" \
    -d "{
      \"kernel_image_path\": \"${KERNEL_PATH}\",
      \"boot_args\": \"console=ttyS0 reboot=k panic=1 pci=off ip=${GUEST_IP}::${HOST_IP}:255.255.255.252::eth0:off\"
    }" || die "Failed to set boot source"

  # Configure rootfs drive
  info "Attaching root drive..."
  curl --silent --unix-socket "${SOCKET_PATH}" -X PUT \
    "http://localhost/drives/rootfs" \
    -H "Content-Type: application/json" \
    -d "{
      \"drive_id\": \"rootfs\",
      \"path_on_host\": \"${TMPDIR}/disk.ext4\",
      \"is_root_device\": true,
      \"is_read_only\": false
    }" || die "Failed to attach root drive"

  # Configure network interface
  info "Configuring network interface..."
  curl --silent --unix-socket "${SOCKET_PATH}" -X PUT \
    "http://localhost/network-interfaces/eth0" \
    -H "Content-Type: application/json" \
    -d "{
      \"iface_id\": \"eth0\",
      \"guest_mac\": \"${GUEST_MAC}\",
      \"host_dev_name\": \"${TAP_DEVICE}\"
    }" || die "Failed to configure network"

  # Start the VM
  info "Starting VM..."
  curl --silent --unix-socket "${SOCKET_PATH}" -X PUT \
    "http://localhost/actions" \
    -H "Content-Type: application/json" \
    -d '{"action_type": "InstanceStart"}' || die "Failed to start VM"

  info "VM started"
}

# --- Wait for SSH ------------------------------------------------------------

wait_for_ssh() {
  step "Waiting for SSH (timeout: ${SSH_WAIT_TIMEOUT}s)"

  local start_time
  start_time="$(date +%s)"

  while true; do
    local elapsed=$(( $(date +%s) - start_time ))
    if [[ ${elapsed} -ge ${SSH_WAIT_TIMEOUT} ]]; then
      die "SSH did not become available within ${SSH_WAIT_TIMEOUT}s"
    fi

    if ssh ${SSH_OPTS} -i "${SSH_KEY}" "root@${GUEST_IP}" "echo ok" &>/dev/null; then
      info "SSH is ready (took ${elapsed}s)"
      return
    fi

    sleep 1
  done
}

# --- Run setup script --------------------------------------------------------

run_setup() {
  step "Running setup script inside VM"

  if [[ -z "${SETUP_SCRIPT}" ]]; then
    info "No setup script configured, skipping"
    return
  fi

  # Write setup script to a temp file and copy to VM
  local setup_file="${TMPDIR}/setup.sh"
  echo "${SETUP_SCRIPT}" > "${setup_file}"
  chmod +x "${setup_file}"

  info "Copying setup script to VM..."
  scp ${SSH_OPTS} -i "${SSH_KEY}" "${setup_file}" "root@${GUEST_IP}:/tmp/setup.sh"

  info "Executing setup script (timeout: ${SETUP_TIMEOUT}s)..."
  ssh ${SSH_OPTS} -i "${SSH_KEY}" "root@${GUEST_IP}" \
    "chmod +x /tmp/setup.sh && timeout ${SETUP_TIMEOUT} /tmp/setup.sh" \
    || die "Setup script failed"

  info "Setup script completed"

  # Clean up inside VM
  ssh ${SSH_OPTS} -i "${SSH_KEY}" "root@${GUEST_IP}" \
    "rm -f /tmp/setup.sh && sync" || warn "Cleanup inside VM failed"
}

# --- Create snapshot ---------------------------------------------------------

create_snapshot() {
  step "Creating snapshot"

  # Flush filesystem in the VM before pausing
  info "Syncing VM filesystem..."
  ssh ${SSH_OPTS} -i "${SSH_KEY}" "root@${GUEST_IP}" "sync" || warn "sync failed"

  # Pause the VM
  info "Pausing VM..."
  curl --silent --unix-socket "${SOCKET_PATH}" -X PATCH \
    "http://localhost/vm" \
    -H "Content-Type: application/json" \
    -d '{"state": "Paused"}' || die "Failed to pause VM"

  info "VM paused"

  # Create snapshot (memory + vmstate)
  info "Saving snapshot to ${TMPDIR}..."
  curl --silent --unix-socket "${SOCKET_PATH}" -X PUT \
    "http://localhost/snapshot/create" \
    -H "Content-Type: application/json" \
    -d "{
      \"snapshot_type\": \"Full\",
      \"snapshot_path\": \"${TMPDIR}/vmstate.snap\",
      \"mem_file_path\": \"${TMPDIR}/memory.snap\"
    }" || die "Failed to create snapshot"

  info "Snapshot files created"

  # Verify all files exist
  for f in disk.ext4 memory.snap vmstate.snap; do
    if [[ ! -f "${TMPDIR}/${f}" ]]; then
      die "Expected snapshot file missing: ${TMPDIR}/${f}"
    fi
  done
}

# --- Compute checksums -------------------------------------------------------

compute_checksums() {
  step "Computing SHA-256 checksums"

  for f in disk.ext4 memory.snap vmstate.snap; do
    local filepath="${TMPDIR}/${f}"
    local checksum size
    checksum="$(sha256sum "${filepath}" | awk '{print $1}')"
    size="$(du -h "${filepath}" | cut -f1)"
    info "  ${f}: ${checksum} (${size})"
  done
}

# --- Copy to final location --------------------------------------------------

install_snapshot() {
  step "Installing snapshot"

  local dest="${PAWS_DATA_DIR}/snapshots/${SNAPSHOT_ID}"

  if [[ -d "${dest}" ]] && [[ ! -L "${dest}" ]]; then
    local backup="${dest}.bak.$(date +%Y%m%d%H%M%S)"
    warn "Existing snapshot at ${dest}, backing up to ${backup}"
    mv "${dest}" "${backup}"
  fi

  # If dest is a symlink, remove it
  [[ -L "${dest}" ]] && rm -f "${dest}"

  mkdir -p "${dest}"
  cp --reflink=auto "${TMPDIR}/disk.ext4" "${dest}/disk.ext4"
  cp "${TMPDIR}/memory.snap" "${dest}/memory.snap"
  cp "${TMPDIR}/vmstate.snap" "${dest}/vmstate.snap"

  # Write manifest
  local manifest="${dest}/manifest.json"
  bun -e "
    import { createHash } from 'node:crypto';
    import { readFileSync, statSync, writeFileSync } from 'node:fs';

    const files = ['disk.ext4', 'memory.snap', 'vmstate.snap'];
    const checksums = {};

    for (const f of files) {
      const path = '${dest}/' + f;
      const data = readFileSync(path);
      const hash = createHash('sha256').update(data).digest('hex');
      const size = statSync(path).size;
      checksums[f] = { sha256: hash, size };
    }

    const manifest = {
      id: '${SNAPSHOT_ID}',
      version: 1,
      files: checksums,
      createdAt: new Date().toISOString(),
    };

    writeFileSync('${manifest}', JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
  " || warn "Failed to write manifest"

  info "Snapshot installed to ${dest}"
}

# --- Print summary -----------------------------------------------------------

print_summary() {
  local dest="${PAWS_DATA_DIR}/snapshots/${SNAPSHOT_ID}"

  echo ""
  echo " /\\_/\\"
  echo "( o.o )  snapshot built!"
  echo " > ^ <"
  echo ""
  info "Snapshot: ${SNAPSHOT_ID}"
  info "Location: ${dest}"
  info "Files:"
  for f in disk.ext4 memory.snap vmstate.snap; do
    local size
    size="$(du -h "${dest}/${f}" | cut -f1)"
    info "  ${f}: ${size}"
  done
  local total
  total="$(du -sh "${dest}" | cut -f1)"
  info "Total: ${total}"
  echo ""
}

# --- Main --------------------------------------------------------------------

main() {
  echo ""
  echo " /\\_/\\"
  echo "( o.o )  paws snapshot builder"
  echo " > ^ <"
  echo ""

  local config_file=""
  local do_upload=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --upload)
        do_upload=true
        ;;
      --help|-h)
        echo "Usage: sudo $0 <config.yaml> [--upload]"
        echo ""
        echo "Builds a Firecracker VM snapshot from a YAML config file."
        echo ""
        echo "Arguments:"
        echo "  config.yaml        Path to snapshot config YAML"
        echo "  --upload            Upload to R2 after building"
        echo ""
        echo "Environment:"
        echo "  PAWS_DATA_DIR       Data directory (default: /var/lib/paws)"
        echo "  FIRECRACKER_BIN     Firecracker binary path"
        echo "  R2_ENDPOINT         R2 endpoint (for --upload)"
        echo "  R2_ACCESS_KEY_ID    R2 access key (for --upload)"
        echo "  R2_SECRET_ACCESS_KEY  R2 secret key (for --upload)"
        echo "  R2_BUCKET_NAME      R2 bucket (for --upload)"
        exit 0
        ;;
      *)
        if [[ -z "${config_file}" ]]; then
          config_file="$1"
        else
          die "Unknown argument: $1. Use --help for usage."
        fi
        ;;
    esac
    shift
  done

  if [[ -z "${config_file}" ]]; then
    die "Usage: sudo $0 <config.yaml> [--upload]"
  fi

  preflight
  parse_config "${config_file}"
  prepare_workdir
  setup_network
  boot_vm
  wait_for_ssh
  run_setup
  create_snapshot

  # Stop firecracker before copying files (releases disk.ext4 lock)
  info "Stopping Firecracker..."
  kill "${FC_PID}" 2>/dev/null || true
  sleep 1
  kill -9 "${FC_PID}" 2>/dev/null || true
  FC_PID=""  # Prevent cleanup from trying again

  compute_checksums
  install_snapshot
  print_summary

  if [[ "${do_upload}" = true ]]; then
    step "Uploading to R2"
    bun run "${PROJECT_ROOT}/scripts/upload-snapshot.ts" \
      "${SNAPSHOT_ID}" "${PAWS_DATA_DIR}/snapshots/${SNAPSHOT_ID}"
  else
    info "Run with --upload to push to R2, or manually:"
    info "  bun run scripts/upload-snapshot.ts ${SNAPSHOT_ID} ${PAWS_DATA_DIR}/snapshots/${SNAPSHOT_ID}"
  fi

  # Clean up temp dir on success
  if [[ -n "${TMPDIR}" ]] && [[ -d "${TMPDIR}" ]]; then
    rm -rf "${TMPDIR}"
    TMPDIR=""
  fi
}

main "$@"
