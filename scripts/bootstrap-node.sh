#!/usr/bin/env bash
# /\_/\
# ( o.o )  bootstrap a paws worker node
#  > ^ <
#
# Sets up a fresh Linux server to run paws: installs system dependencies,
# Firecracker, containerd, kubeadm/kubelet, Bun, configures networking/sysctl,
# and prepares the node to accept VM workloads.
#
# Usage:
#   sudo ./scripts/bootstrap-node.sh
#   sudo ./scripts/bootstrap-node.sh --join "kubeadm join 10.0.1.10:6443 --token ..."
#   sudo ./scripts/bootstrap-node.sh --snapshot-url https://storage.example.com/snapshot.tar.gz
#   sudo PAWS_DATA_DIR=/custom/path ./scripts/bootstrap-node.sh
#
# What it does:
#   1. Installs system packages (iptables, iproute2, debootstrap, etc.)
#   2. Installs containerd + kubeadm + kubelet + kubectl (K8s v1.29)
#   3. Configures kernel parameters for IP forwarding and Firecracker
#   4. Installs Bun runtime
#   5. Runs install-firecracker.sh (binary, kernel, rootfs, SSH keys)
#   6. Sets up KVM device permissions
#   7. Joins an existing kubeadm cluster (if --join is provided)
#   8. Pulls a base VM snapshot (if --snapshot-url is provided)
#   9. Verifies the installation
#
# Idempotent: safe to run multiple times. Skips already-completed steps.
#
# Requirements:
#   - Ubuntu 24.04+ or Debian 12+ (other distros: install packages manually)
#   - Root access
#   - KVM-capable CPU (Intel VT-x / AMD-V)
#   - At least 8 GB RAM, 20 GB disk

set -euo pipefail

# --- Configuration -----------------------------------------------------------

PAWS_DATA_DIR="${PAWS_DATA_DIR:-/var/lib/paws}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN_VERSION="${BUN_VERSION:-latest}"
KUBE_VERSION="${KUBE_VERSION:-v1.29}"
KUBEADM_JOIN_CMD=""
SNAPSHOT_URL=""

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
    gnupg
    lsb-release
    apt-transport-https
    openssh-client
    ca-certificates

    # KVM / virtualization
    qemu-kvm
    cpu-checker

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

# --- Install containerd -------------------------------------------------------

install_containerd() {
  step "Installing containerd"

  if systemctl is-active --quiet containerd 2>/dev/null; then
    info "containerd already running, skipping"
    return
  fi

  if ! command -v apt-get &>/dev/null; then
    warn "Non-Debian system — install containerd manually"
    return
  fi

  install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq containerd.io >/dev/null 2>&1

  mkdir -p /etc/containerd
  containerd config default > /etc/containerd/config.toml
  sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

  systemctl restart containerd
  systemctl enable containerd

  info "containerd installed and configured (SystemdCgroup=true)"
}

# --- Install kubeadm / kubelet / kubectl --------------------------------------

install_kubernetes() {
  step "Installing kubeadm, kubelet, kubectl (${KUBE_VERSION})"

  if command -v kubeadm &>/dev/null; then
    local current
    current="$(kubeadm version -o short 2>/dev/null || echo "unknown")"
    info "kubeadm already installed (${current}), skipping"
    return
  fi

  if ! command -v apt-get &>/dev/null; then
    warn "Non-Debian system — install kubeadm/kubelet/kubectl manually"
    return
  fi

  if [[ ! -f /etc/apt/keyrings/kubernetes.gpg ]]; then
    curl -fsSL "https://pkgs.k8s.io/core:/stable:/${KUBE_VERSION}/deb/Release.key" \
      | gpg --dearmor -o /etc/apt/keyrings/kubernetes.gpg
  fi

  echo "deb [signed-by=/etc/apt/keyrings/kubernetes.gpg] \
    https://pkgs.k8s.io/core:/stable:/${KUBE_VERSION}/deb/ /" \
    > /etc/apt/sources.list.d/kubernetes.list

  apt-get update -qq
  apt-get install -y -qq kubelet kubeadm kubectl >/dev/null 2>&1
  apt-mark hold kubelet kubeadm kubectl

  systemctl enable kubelet

  # Disable swap (K8s requirement).
  swapoff -a
  sed -i '/swap/d' /etc/fstab

  info "kubeadm, kubelet, kubectl installed and held"
}

# --- Configure kernel parameters ----------------------------------------------

configure_sysctl() {
  step "Configuring kernel parameters"

  local sysctl_file="/etc/sysctl.d/99-paws.conf"

  cat > "${sysctl_file}" <<'SYSCTL'
# paws: Firecracker VM networking + Kubernetes
# Enable IP forwarding for VM ↔ host communication and pod networking
net.ipv4.ip_forward = 1

# Bridge netfilter — required by kubeadm / kube-proxy
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1

# Connection tracking for iptables NAT
net.netfilter.nf_conntrack_max = 131072

# Prevent ARP flux on multi-homed hosts (TAP devices)
net.ipv4.conf.all.arp_filter = 1
SYSCTL

  # Load required kernel modules
  modprobe overlay
  modprobe br_netfilter
  modprobe kvm_amd 2>/dev/null || modprobe kvm_intel 2>/dev/null || true

  # Persist modules across reboots
  cat > /etc/modules-load.d/paws.conf <<'MODULES'
overlay
br_netfilter
MODULES

  sysctl --system >/dev/null 2>&1
  info "IP forwarding enabled"
  info "Bridge netfilter enabled"
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

# --- Join kubeadm cluster -----------------------------------------------------

join_cluster() {
  step "Joining kubeadm cluster"

  if [[ -z "${KUBEADM_JOIN_CMD}" ]]; then
    info "No --join command provided, skipping cluster join"
    return
  fi

  # Check if already joined
  if systemctl is-active --quiet kubelet 2>/dev/null && \
     [[ -f /etc/kubernetes/kubelet.conf ]]; then
    warn "Node appears to already be joined to a cluster, skipping"
    return
  fi

  info "Running: ${KUBEADM_JOIN_CMD}"
  eval "${KUBEADM_JOIN_CMD}"
  info "Cluster join complete"
}

# --- Pull base snapshot -------------------------------------------------------

pull_snapshot() {
  step "Pulling base snapshot"

  if [[ -z "${SNAPSHOT_URL}" ]]; then
    info "No --snapshot-url provided, skipping snapshot pull"
    return
  fi

  local snapshot_dir="${PAWS_DATA_DIR}/snapshots/agent-latest"

  if [[ -d "${snapshot_dir}" ]] && [[ -f "${snapshot_dir}/vmstate.snap" ]]; then
    warn "Snapshot already exists at ${snapshot_dir}, skipping"
    warn "Delete and re-run to replace: rm -rf ${snapshot_dir}"
    return
  fi

  mkdir -p "${snapshot_dir}"

  info "Downloading snapshot from ${SNAPSHOT_URL}..."
  curl -fSL --retry 3 --progress-bar -o /tmp/paws-snapshot.tar.gz "${SNAPSHOT_URL}" \
    || die "Failed to download snapshot from ${SNAPSHOT_URL}"

  info "Extracting snapshot..."
  tar -xzf /tmp/paws-snapshot.tar.gz -C "${snapshot_dir}"
  rm -f /tmp/paws-snapshot.tar.gz

  local snap_size
  snap_size="$(du -sh "${snapshot_dir}" | cut -f1)"
  info "Snapshot extracted: ${snapshot_dir} (${snap_size})"
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

  # containerd
  if systemctl is-active --quiet containerd 2>/dev/null; then
    info "containerd:          running"
  else
    warn "containerd:          not running"
  fi

  # kubelet
  if command -v kubeadm &>/dev/null; then
    info "kubeadm:             $(kubeadm version -o short 2>/dev/null || echo "installed")"
  else
    warn "kubeadm:             NOT FOUND"
  fi

  if systemctl is-enabled --quiet kubelet 2>/dev/null; then
    info "kubelet:             enabled"
  else
    warn "kubelet:             not enabled"
  fi

  # Data directory
  if [[ -d "${PAWS_DATA_DIR}" ]]; then
    info "Data dir:            ${PAWS_DATA_DIR}"
    for subdir in snapshots vms state ssh kernels rootfs; do
      if [[ -d "${PAWS_DATA_DIR}/${subdir}" ]]; then
        info "  ${subdir}/:          OK"
      else
        warn "  ${subdir}/:          MISSING"
      fi
    done
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

  # Snapshot
  if [[ -f "${PAWS_DATA_DIR}/snapshots/agent-latest/vmstate.snap" ]]; then
    local ssize
    ssize="$(du -sh "${PAWS_DATA_DIR}/snapshots/agent-latest" | cut -f1)"
    info "Snapshot:            ${PAWS_DATA_DIR}/snapshots/agent-latest/ (${ssize})"
  else
    warn "Snapshot:            NOT FOUND (pull with --snapshot-url or build separately)"
  fi

  # Bun
  if command -v bun &>/dev/null; then
    info "Bun:                 v$(bun --version 2>/dev/null)"
  else
    error "Bun:                 NOT FOUND"
    failed=true
  fi

  # Disk space
  local disk_avail
  disk_avail="$(df -BG --output=avail "${PAWS_DATA_DIR}" 2>/dev/null | tail -1 | tr -d 'G ')"
  if [[ -n "${disk_avail}" ]]; then
    if [[ ${disk_avail} -lt 20 ]]; then
      warn "Disk available:      ${disk_avail} GB (recommended: 20+ GB)"
    else
      info "Disk available:      ${disk_avail} GB"
    fi
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

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help|-h)
        echo "Usage: sudo $0 [OPTIONS]"
        echo ""
        echo "Bootstraps a fresh Ubuntu 24.04 server as a paws worker node."
        echo ""
        echo "Options:"
        echo "  --join CMD            kubeadm join command to join an existing cluster"
        echo "  --snapshot-url URL    URL to a .tar.gz snapshot to pull"
        echo "  --help                Show this help"
        echo ""
        echo "Environment:"
        echo "  PAWS_DATA_DIR         Data directory (default: /var/lib/paws)"
        echo "  PAWS_REPO_DIR         paws repo checkout dir (default: /opt/paws)"
        echo "  BUN_VERSION           Bun version to install (default: latest)"
        echo "  FIRECRACKER_VERSION   Firecracker version (default: v1.12.0)"
        echo "  KUBE_VERSION          Kubernetes apt repo version (default: v1.29)"
        exit 0
        ;;
      --join)
        shift
        KUBEADM_JOIN_CMD="$1"
        ;;
      --snapshot-url)
        shift
        SNAPSHOT_URL="$1"
        ;;
      *)
        die "Unknown argument: $1. Use --help for usage."
        ;;
    esac
    shift
  done

  preflight
  install_system_packages
  configure_sysctl
  install_containerd
  install_kubernetes
  configure_kvm
  install_bun
  install_firecracker
  create_systemd_services
  join_cluster
  pull_snapshot
  verify

  echo ""
  info "Node bootstrap complete!"
  echo ""
  info "Quick start:"
  info "  1. Clone paws:       git clone https://github.com/arek-e/paws ${PAWS_REPO_DIR:-/opt/paws}"
  info "  2. Install deps:     cd ${PAWS_REPO_DIR:-/opt/paws} && bun install"
  info "  3. Start services:   bun run start"
  info "  4. Or use systemd:   systemctl start paws-worker paws-gateway"
  echo ""
  info "To join a cluster:"
  info "  sudo $0 --join 'kubeadm join 10.0.1.10:6443 --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>'"
  echo ""
}

main "$@"
