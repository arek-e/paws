#!/usr/bin/env bash
# /\_/\
# ( o.o )  bootstrap a paws worker node
#  > ^ <
#
# Sets up a fresh Linux server to run paws: installs system dependencies,
# Firecracker, Bun, configures networking/sysctl, and prepares the node
# to accept VM workloads.
#
# Usage:
#   sudo ./scripts/bootstrap-node.sh
#   sudo PAWS_DATA_DIR=/custom/path ./scripts/bootstrap-node.sh
#
# What it does:
#   1. Installs system packages (iptables, iproute2, debootstrap, etc.)
#   2. Configures kernel parameters for IP forwarding and Firecracker
#   3. Installs Bun runtime
#   4. Runs install-firecracker.sh (binary, kernel, rootfs, SSH keys)
#   5. Sets up KVM device permissions
#   6. Verifies the installation
#
# Requirements:
#   - Ubuntu 22.04+ or Debian 12+ (other distros: install packages manually)
#   - Root access
#   - KVM-capable CPU (Intel VT-x / AMD-V)
#   - At least 8 GB RAM, 20 GB disk

set -euo pipefail

# --- Configuration -----------------------------------------------------------

PAWS_DATA_DIR="${PAWS_DATA_DIR:-/var/lib/paws}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN_VERSION="${BUN_VERSION:-latest}"

# --- Colors / helpers ---------------------------------------------------------

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

# --- Pre-flight checks --------------------------------------------------------

preflight() {
  step "Pre-flight checks"

  if [[ $EUID -ne 0 ]]; then
    die "This script must be run as root (sudo ./scripts/bootstrap-node.sh)"
  fi

  if [[ "$(uname -s)" != "Linux" ]]; then
    die "paws requires Linux. Current OS: $(uname -s)"
  fi

  # Check CPU virtualization support
  if ! grep -qE '(vmx|svm)' /proc/cpuinfo 2>/dev/null; then
    die "CPU does not support hardware virtualization (Intel VT-x / AMD-V)"
  fi
  info "CPU virtualization support: OK"

  # Check /dev/kvm
  if [[ ! -e /dev/kvm ]]; then
    warn "/dev/kvm not found, attempting to load KVM module..."
    modprobe kvm 2>/dev/null || true
    modprobe kvm_intel 2>/dev/null || modprobe kvm_amd 2>/dev/null || true

    if [[ ! -e /dev/kvm ]]; then
      die "Cannot create /dev/kvm. Ensure KVM is enabled in BIOS and kernel."
    fi
  fi
  info "KVM: OK (/dev/kvm present)"

  # Check minimum resources
  local mem_kb
  mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  local mem_gb=$(( mem_kb / 1024 / 1024 ))
  if [[ ${mem_gb} -lt 7 ]]; then
    warn "Only ${mem_gb} GB RAM detected. Recommended: 8+ GB."
  else
    info "RAM: ${mem_gb} GB"
  fi

  local disk_avail
  disk_avail="$(df -BG --output=avail "${PAWS_DATA_DIR%/*}" 2>/dev/null | tail -1 | tr -d 'G ')"
  if [[ -n "${disk_avail}" ]] && [[ ${disk_avail} -lt 20 ]]; then
    warn "Only ${disk_avail} GB disk available. Recommended: 20+ GB."
  else
    info "Disk: ${disk_avail:-?} GB available"
  fi
}

# --- Install system packages --------------------------------------------------

install_system_packages() {
  step "Installing system packages"

  # Detect package manager
  if command -v apt-get &>/dev/null; then
    install_apt_packages
  elif command -v dnf &>/dev/null; then
    install_dnf_packages
  else
    warn "Unsupported package manager. Install these manually:"
    warn "  iptables, iproute2, debootstrap, curl, openssh-client, e2fsprogs"
    return
  fi
}

install_apt_packages() {
  info "Updating apt package lists..."
  apt-get update -qq

  local packages=(
    # Networking
    iptables
    iproute2

    # Rootfs creation
    debootstrap

    # General utilities
    curl
    tar
    openssh-client
    ca-certificates

    # Filesystem
    e2fsprogs    # mkfs.ext4

    # Process management
    procps       # ps, kill
  )

  info "Installing: ${packages[*]}"
  apt-get install -y -qq "${packages[@]}" >/dev/null 2>&1
  info "System packages installed"
}

install_dnf_packages() {
  local packages=(
    iptables
    iproute
    curl
    tar
    openssh-clients
    ca-certificates
    e2fsprogs
    procps-ng
  )

  info "Installing: ${packages[*]}"
  dnf install -y -q "${packages[@]}" >/dev/null 2>&1

  # debootstrap isn't in default RHEL/Fedora repos
  if ! command -v debootstrap &>/dev/null; then
    warn "debootstrap not available via dnf. Rootfs will be created via docker if available."
  fi

  info "System packages installed"
}

# --- Configure kernel parameters ----------------------------------------------

configure_sysctl() {
  step "Configuring kernel parameters"

  local sysctl_file="/etc/sysctl.d/99-paws.conf"

  cat > "${sysctl_file}" <<'SYSCTL'
# paws: Firecracker VM networking
# Enable IP forwarding for VM ↔ host communication
net.ipv4.ip_forward = 1

# Connection tracking for iptables NAT
net.netfilter.nf_conntrack_max = 131072

# Prevent ARP flux on multi-homed hosts (TAP devices)
net.ipv4.conf.all.arp_filter = 1
SYSCTL

  sysctl --system >/dev/null 2>&1
  info "IP forwarding enabled"
  info "Conntrack max set to 131072"
  info "Sysctl config written to ${sysctl_file}"
}

# --- Configure KVM permissions ------------------------------------------------

configure_kvm() {
  step "Configuring KVM device permissions"

  # Ensure /dev/kvm is accessible
  chmod 666 /dev/kvm
  info "Set /dev/kvm permissions to 666"

  # Persist via udev rule so it survives reboot
  local udev_rule="/etc/udev/rules.d/99-kvm.rules"
  if [[ ! -f "${udev_rule}" ]]; then
    echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' > "${udev_rule}"
    info "Created udev rule: ${udev_rule}"
  fi
}

# --- Install Bun --------------------------------------------------------------

install_bun() {
  step "Installing Bun runtime"

  if command -v bun &>/dev/null; then
    local current
    current="$(bun --version 2>/dev/null || echo "unknown")"
    info "Bun already installed (v${current})"
    return
  fi

  info "Downloading and installing Bun..."
  curl -fsSL https://bun.sh/install | bash

  # Make bun available system-wide
  local bun_bin="${HOME}/.bun/bin/bun"
  if [[ -f "${bun_bin}" ]] && [[ ! -f "/usr/local/bin/bun" ]]; then
    ln -sf "${bun_bin}" /usr/local/bin/bun
    info "Symlinked bun to /usr/local/bin/bun"
  fi

  bun --version 2>/dev/null && info "Bun installed successfully" || warn "Bun installed but not in PATH"
}

# --- Run install-firecracker.sh -----------------------------------------------

install_firecracker() {
  step "Installing Firecracker"

  local install_script="${SCRIPT_DIR}/install-firecracker.sh"

  if [[ ! -f "${install_script}" ]]; then
    die "install-firecracker.sh not found at ${install_script}"
  fi

  PAWS_DATA_DIR="${PAWS_DATA_DIR}" bash "${install_script}"
}

# --- Create systemd service (optional) ----------------------------------------

create_systemd_services() {
  step "Creating systemd service files"

  # Worker service
  cat > /etc/systemd/system/paws-worker.service <<UNIT
[Unit]
Description=paws worker — Firecracker VM executor
After=network.target
Requires=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bun run apps/worker/src/server.ts
WorkingDirectory=${PAWS_REPO_DIR:-/opt/paws}
Restart=on-failure
RestartSec=5

Environment=PORT=3000
Environment=MAX_CONCURRENT_VMS=5
Environment=MAX_QUEUE_SIZE=10
Environment=SNAPSHOT_DIR=${PAWS_DATA_DIR}/snapshots/agent-latest
Environment=VM_BASE_DIR=${PAWS_DATA_DIR}/vms
Environment=SSH_KEY_PATH=${PAWS_DATA_DIR}/ssh/id_ed25519

# Security hardening
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
UNIT

  # Gateway service
  cat > /etc/systemd/system/paws-gateway.service <<UNIT
[Unit]
Description=paws gateway — API control plane
After=network.target
Requires=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bun run apps/gateway/src/server.ts
WorkingDirectory=${PAWS_REPO_DIR:-/opt/paws}
Restart=on-failure
RestartSec=5

Environment=PORT=4000
Environment=API_KEY=paws-dev-key
Environment=WORKER_URL=http://localhost:3000

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  info "Created paws-worker.service"
  info "Created paws-gateway.service"
  info "Start with: systemctl start paws-worker paws-gateway"
}

# --- Verify installation ------------------------------------------------------

verify() {
  step "Verifying installation"

  local failed=false

  # Firecracker binary
  if command -v firecracker &>/dev/null; then
    info "firecracker binary:  $(firecracker --version 2>/dev/null | head -1)"
  else
    error "firecracker binary:  NOT FOUND"
    failed=true
  fi

  # Jailer binary
  if command -v jailer &>/dev/null; then
    info "jailer binary:       OK"
  else
    warn "jailer binary:       NOT FOUND (optional)"
  fi

  # KVM
  if [[ -e /dev/kvm ]]; then
    info "/dev/kvm:            OK"
  else
    error "/dev/kvm:            NOT FOUND"
    failed=true
  fi

  # IP forwarding
  local ip_fwd
  ip_fwd="$(sysctl -n net.ipv4.ip_forward 2>/dev/null)"
  if [[ "${ip_fwd}" = "1" ]]; then
    info "IP forwarding:       enabled"
  else
    error "IP forwarding:       disabled"
    failed=true
  fi

  # Data directory
  if [[ -d "${PAWS_DATA_DIR}" ]]; then
    info "Data dir:            ${PAWS_DATA_DIR}"
  else
    error "Data dir:            NOT FOUND"
    failed=true
  fi

  # SSH key
  if [[ -f "${PAWS_DATA_DIR}/ssh/id_ed25519" ]]; then
    info "SSH key:             ${PAWS_DATA_DIR}/ssh/id_ed25519"
  else
    error "SSH key:             NOT FOUND"
    failed=true
  fi

  # Kernel
  if [[ -f "${PAWS_DATA_DIR}/kernels/vmlinux-default" ]]; then
    local ksize
    ksize="$(du -h "${PAWS_DATA_DIR}/kernels/vmlinux-default" | cut -f1)"
    info "Kernel:              ${PAWS_DATA_DIR}/kernels/vmlinux-default (${ksize})"
  else
    warn "Kernel:              NOT FOUND (download separately)"
  fi

  # Rootfs
  if [[ -f "${PAWS_DATA_DIR}/rootfs/ubuntu-default.ext4" ]]; then
    local rsize
    rsize="$(du -h "${PAWS_DATA_DIR}/rootfs/ubuntu-default.ext4" | cut -f1)"
    info "Rootfs:              ${PAWS_DATA_DIR}/rootfs/ubuntu-default.ext4 (${rsize})"
  else
    warn "Rootfs:              NOT FOUND (build separately)"
  fi

  # Bun
  if command -v bun &>/dev/null; then
    info "Bun:                 v$(bun --version 2>/dev/null)"
  else
    error "Bun:                 NOT FOUND"
    failed=true
  fi

  echo ""
  if [[ "${failed}" = true ]]; then
    error "Some checks failed. Review the output above."
    return 1
  else
    info "All checks passed!"
  fi
}

# --- Main ---------------------------------------------------------------------

main() {
  echo ""
  echo " /\\_/\\"
  echo "( o.o )  paws node bootstrap"
  echo " > ^ <"
  echo ""

  for arg in "$@"; do
    case "${arg}" in
      --help|-h)
        echo "Usage: sudo $0 [OPTIONS]"
        echo ""
        echo "Bootstraps a fresh Linux server as a paws worker node."
        echo ""
        echo "Options:"
        echo "  --help              Show this help"
        echo ""
        echo "Environment:"
        echo "  PAWS_DATA_DIR       Data directory (default: /var/lib/paws)"
        echo "  PAWS_REPO_DIR       paws repo checkout dir (default: /opt/paws)"
        echo "  BUN_VERSION         Bun version to install (default: latest)"
        echo "  FIRECRACKER_VERSION Firecracker version (default: v1.12.0)"
        exit 0
        ;;
      *)
        die "Unknown argument: ${arg}. Use --help for usage."
        ;;
    esac
  done

  preflight
  install_system_packages
  configure_sysctl
  configure_kvm
  install_bun
  install_firecracker
  create_systemd_services
  verify

  echo ""
  info "Node bootstrap complete!"
  echo ""
  info "Quick start:"
  info "  1. Clone paws:       git clone https://github.com/paws-dev/paws ${PAWS_REPO_DIR:-/opt/paws}"
  info "  2. Install deps:     cd ${PAWS_REPO_DIR:-/opt/paws} && bun install"
  info "  3. Start services:   bun run start"
  info "  4. Or use systemd:   systemctl start paws-worker paws-gateway"
  echo ""
}

main "$@"
