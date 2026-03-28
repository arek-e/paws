#!/usr/bin/env bash
# /\_/\
# ( o.o )  install firecracker + VM assets
#  > ^ <
#
# Downloads and installs Firecracker binary, a default Linux kernel,
# a base Ubuntu rootfs, and generates an SSH keypair for VM access.
#
# Usage:
#   sudo ./scripts/install-firecracker.sh
#   sudo PAWS_DATA_DIR=/custom/path ./scripts/install-firecracker.sh
#   sudo ./scripts/install-firecracker.sh --skip-rootfs   # Skip rootfs download
#   sudo ./scripts/install-firecracker.sh --skip-kernel    # Skip kernel download
#
# Requirements:
#   - Root access
#   - curl, tar
#   - x86_64 Linux with KVM support

set -euo pipefail

# --- Configuration -----------------------------------------------------------

FIRECRACKER_VERSION="${FIRECRACKER_VERSION:-v1.12.0}"
ARCH="x86_64"
PAWS_DATA_DIR="${PAWS_DATA_DIR:-/var/lib/paws}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# Kernel: Firecracker CI-built kernel from upstream releases
KERNEL_VERSION="${KERNEL_VERSION:-6.1}"
KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/firecracker-ci/v${KERNEL_VERSION}/${ARCH}/vmlinux-5.10.225"

# Rootfs: minimal Ubuntu 24.04 base image
ROOTFS_SIZE_MB="${ROOTFS_SIZE_MB:-4096}"

# --- Colors / helpers ---------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[paws]${NC} $*"; }
warn()  { echo -e "${YELLOW}[paws]${NC} $*"; }
error() { echo -e "${RED}[paws]${NC} $*" >&2; }

die() { error "$@"; exit 1; }

# --- Pre-flight checks --------------------------------------------------------

check_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This script must be run as root (sudo ./scripts/install-firecracker.sh)"
  fi
}

check_kvm() {
  if [[ ! -e /dev/kvm ]]; then
    die "/dev/kvm not found. KVM support is required for Firecracker."
  fi
  info "KVM support detected"
}

check_arch() {
  local arch
  arch="$(uname -m)"
  if [[ "${arch}" != "x86_64" && "${arch}" != "aarch64" ]]; then
    die "Unsupported architecture: ${arch}. Firecracker supports x86_64 and aarch64."
  fi
  ARCH="${arch}"
  info "Architecture: ${ARCH}"
}

check_dependencies() {
  local missing=()
  for cmd in curl tar; do
    if ! command -v "${cmd}" &>/dev/null; then
      missing+=("${cmd}")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    die "Missing required commands: ${missing[*]}"
  fi
}

# --- Install Firecracker binary -----------------------------------------------

install_firecracker() {
  if command -v firecracker &>/dev/null; then
    local current_version
    current_version="$(firecracker --version 2>/dev/null | head -1 | awk '{print $2}' || echo "unknown")"
    warn "Firecracker already installed (${current_version})"
    warn "Reinstalling ${FIRECRACKER_VERSION}..."
  fi

  info "Downloading Firecracker ${FIRECRACKER_VERSION} for ${ARCH}..."

  local release_url="https://github.com/firecracker-microvm/firecracker/releases/download"
  local tarball="firecracker-${FIRECRACKER_VERSION}-${ARCH}.tgz"
  local download_url="${release_url}/${FIRECRACKER_VERSION}/${tarball}"

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf ${tmpdir}" EXIT

  curl -fSL --retry 3 --progress-bar -o "${tmpdir}/${tarball}" "${download_url}" \
    || die "Failed to download Firecracker from ${download_url}"

  tar -xzf "${tmpdir}/${tarball}" -C "${tmpdir}" \
    || die "Failed to extract Firecracker tarball"

  # The tarball extracts to release-<version>-<arch>/
  local release_dir="${tmpdir}/release-${FIRECRACKER_VERSION}-${ARCH}"

  install -m 0755 "${release_dir}/firecracker-${FIRECRACKER_VERSION}-${ARCH}" \
    "${INSTALL_DIR}/firecracker"

  install -m 0755 "${release_dir}/jailer-${FIRECRACKER_VERSION}-${ARCH}" \
    "${INSTALL_DIR}/jailer"

  rm -rf "${tmpdir}"
  trap - EXIT

  info "Installed firecracker to ${INSTALL_DIR}/firecracker"
  info "Installed jailer to ${INSTALL_DIR}/jailer"
  firecracker --version 2>/dev/null | head -1 || true
}

# --- Create directory structure -----------------------------------------------

create_directories() {
  info "Creating paws data directories at ${PAWS_DATA_DIR}..."

  mkdir -p "${PAWS_DATA_DIR}"/{kernels,rootfs,snapshots,vms,ssh,state}

  info "Directory structure:"
  info "  ${PAWS_DATA_DIR}/kernels/    - VM kernels"
  info "  ${PAWS_DATA_DIR}/rootfs/     - Base root filesystems"
  info "  ${PAWS_DATA_DIR}/snapshots/  - VM snapshots"
  info "  ${PAWS_DATA_DIR}/vms/        - Active VM working dirs"
  info "  ${PAWS_DATA_DIR}/ssh/        - SSH keys for VM access"
  info "  ${PAWS_DATA_DIR}/state/      - Persistent daemon state"
}

# --- Download kernel ----------------------------------------------------------

download_kernel() {
  local kernel_path="${PAWS_DATA_DIR}/kernels/vmlinux-default"

  if [[ -f "${kernel_path}" ]]; then
    warn "Kernel already exists at ${kernel_path}, skipping"
    return
  fi

  info "Downloading default kernel (${KERNEL_VERSION})..."

  curl -fSL --retry 3 --progress-bar -o "${kernel_path}" "${KERNEL_URL}" \
    || die "Failed to download kernel from ${KERNEL_URL}"

  chmod 0644 "${kernel_path}"
  local size
  size="$(du -h "${kernel_path}" | cut -f1)"
  info "Kernel installed: ${kernel_path} (${size})"
}

# --- Create base rootfs -------------------------------------------------------

create_rootfs() {
  local rootfs_path="${PAWS_DATA_DIR}/rootfs/ubuntu-default.ext4"

  if [[ -f "${rootfs_path}" ]]; then
    warn "Rootfs already exists at ${rootfs_path}, skipping"
    return
  fi

  # Check for debootstrap or docker
  if command -v debootstrap &>/dev/null; then
    create_rootfs_debootstrap "${rootfs_path}"
  elif command -v docker &>/dev/null; then
    create_rootfs_docker "${rootfs_path}"
  else
    warn "Neither debootstrap nor docker found."
    warn "Creating empty ext4 filesystem as placeholder."
    warn "You will need to populate it manually or install debootstrap/docker."
    create_rootfs_empty "${rootfs_path}"
  fi
}

create_rootfs_debootstrap() {
  local rootfs_path="$1"

  info "Creating Ubuntu 24.04 rootfs with debootstrap (${ROOTFS_SIZE_MB} MB)..."

  # Create sparse ext4 image
  dd if=/dev/zero of="${rootfs_path}" bs=1M count=0 seek="${ROOTFS_SIZE_MB}" 2>/dev/null
  mkfs.ext4 -F -q "${rootfs_path}"

  local mountpoint
  mountpoint="$(mktemp -d)"

  mount -o loop "${rootfs_path}" "${mountpoint}"

  debootstrap --variant=minbase --include=openssh-server,curl,ca-certificates,iproute2,sudo \
    noble "${mountpoint}" http://archive.ubuntu.com/ubuntu \
    || { umount "${mountpoint}"; rmdir "${mountpoint}"; die "debootstrap failed"; }

  # Configure SSH for key-based access
  configure_rootfs_ssh "${mountpoint}"

  # Configure networking
  configure_rootfs_network "${mountpoint}"

  umount "${mountpoint}"
  rmdir "${mountpoint}"

  local size
  size="$(du -h "${rootfs_path}" | cut -f1)"
  info "Rootfs created: ${rootfs_path} (${size})"
}

create_rootfs_docker() {
  local rootfs_path="$1"

  info "Creating Ubuntu 24.04 rootfs with docker (${ROOTFS_SIZE_MB} MB)..."

  # Create sparse ext4 image
  dd if=/dev/zero of="${rootfs_path}" bs=1M count=0 seek="${ROOTFS_SIZE_MB}" 2>/dev/null
  mkfs.ext4 -F -q "${rootfs_path}"

  local mountpoint container_id
  mountpoint="$(mktemp -d)"

  mount -o loop "${rootfs_path}" "${mountpoint}"

  # Export Ubuntu filesystem from docker
  container_id="$(docker create ubuntu:24.04 /bin/true)"
  docker export "${container_id}" | tar -xf - -C "${mountpoint}"
  docker rm "${container_id}" >/dev/null

  # Install openssh-server inside the rootfs via chroot
  if command -v chroot &>/dev/null; then
    mount --bind /proc "${mountpoint}/proc"
    mount --bind /sys "${mountpoint}/sys"
    mount --bind /dev "${mountpoint}/dev"

    chroot "${mountpoint}" /bin/bash -c \
      "apt-get update -qq && apt-get install -y -qq openssh-server curl ca-certificates iproute2 sudo >/dev/null 2>&1"

    umount "${mountpoint}/dev"
    umount "${mountpoint}/sys"
    umount "${mountpoint}/proc"
  fi

  configure_rootfs_ssh "${mountpoint}"
  configure_rootfs_network "${mountpoint}"

  umount "${mountpoint}"
  rmdir "${mountpoint}"

  local size
  size="$(du -h "${rootfs_path}" | cut -f1)"
  info "Rootfs created: ${rootfs_path} (${size})"
}

create_rootfs_empty() {
  local rootfs_path="$1"

  info "Creating empty ${ROOTFS_SIZE_MB} MB ext4 image..."

  dd if=/dev/zero of="${rootfs_path}" bs=1M count=0 seek="${ROOTFS_SIZE_MB}" 2>/dev/null
  mkfs.ext4 -F -q "${rootfs_path}"

  info "Empty rootfs created: ${rootfs_path}"
  warn "Populate with: mount -o loop ${rootfs_path} /mnt && debootstrap noble /mnt"
}

configure_rootfs_ssh() {
  local mountpoint="$1"

  # Enable root SSH with key-based auth only
  mkdir -p "${mountpoint}/root/.ssh"
  chmod 700 "${mountpoint}/root/.ssh"

  # Copy the public key if it exists
  local pubkey="${PAWS_DATA_DIR}/ssh/id_ed25519.pub"
  if [[ -f "${pubkey}" ]]; then
    cp "${pubkey}" "${mountpoint}/root/.ssh/authorized_keys"
    chmod 600 "${mountpoint}/root/.ssh/authorized_keys"
  fi

  # Configure sshd: key-only, no password
  local sshd_config="${mountpoint}/etc/ssh/sshd_config"
  if [[ -f "${sshd_config}" ]]; then
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "${sshd_config}"
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "${sshd_config}"
    sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' "${sshd_config}"
  fi

  # Ensure sshd starts on boot
  if [[ -d "${mountpoint}/etc/systemd/system" ]]; then
    mkdir -p "${mountpoint}/etc/systemd/system/multi-user.target.wants"
    ln -sf /lib/systemd/system/ssh.service \
      "${mountpoint}/etc/systemd/system/multi-user.target.wants/ssh.service" 2>/dev/null || true
  fi
}

configure_rootfs_network() {
  local mountpoint="$1"

  # Set hostname
  echo "paws-vm" > "${mountpoint}/etc/hostname"

  # Basic /etc/hosts
  cat > "${mountpoint}/etc/hosts" <<'HOSTS'
127.0.0.1 localhost
127.0.1.1 paws-vm
HOSTS

  # Systemd-networkd config for eth0 (Firecracker default interface)
  mkdir -p "${mountpoint}/etc/systemd/network"
  cat > "${mountpoint}/etc/systemd/network/10-eth0.network" <<'NETCFG'
[Match]
Name=eth0

[Network]
DHCP=no

[Address]
# Overridden per-VM by snapshot restore / cloud-init
Address=172.16.0.2/30

[Route]
Gateway=172.16.0.1
NETCFG

  # Enable systemd-networkd
  if [[ -d "${mountpoint}/etc/systemd/system" ]]; then
    mkdir -p "${mountpoint}/etc/systemd/system/multi-user.target.wants"
    ln -sf /lib/systemd/system/systemd-networkd.service \
      "${mountpoint}/etc/systemd/system/multi-user.target.wants/systemd-networkd.service" 2>/dev/null || true
  fi

  # DNS resolver
  mkdir -p "${mountpoint}/etc"
  cat > "${mountpoint}/etc/resolv.conf" <<'DNS'
nameserver 1.1.1.1
nameserver 8.8.8.8
DNS
}

# --- Generate SSH keypair -----------------------------------------------------

generate_ssh_keys() {
  local key_path="${PAWS_DATA_DIR}/ssh/id_ed25519"

  if [[ -f "${key_path}" ]]; then
    warn "SSH keypair already exists at ${key_path}, skipping"
    return
  fi

  info "Generating SSH keypair for VM access..."

  ssh-keygen -t ed25519 -f "${key_path}" -N "" -C "paws-vm-access" -q

  chmod 600 "${key_path}"
  chmod 644 "${key_path}.pub"

  info "SSH keypair generated:"
  info "  Private: ${key_path}"
  info "  Public:  ${key_path}.pub"
}

# --- Main ---------------------------------------------------------------------

main() {
  echo ""
  echo " /\\_/\\"
  echo "( o.o )  paws firecracker installer"
  echo " > ^ <"
  echo ""

  local skip_rootfs=false
  local skip_kernel=false

  for arg in "$@"; do
    case "${arg}" in
      --skip-rootfs)  skip_rootfs=true ;;
      --skip-kernel)  skip_kernel=true ;;
      --help|-h)
        echo "Usage: sudo $0 [OPTIONS]"
        echo ""
        echo "Installs Firecracker and VM assets for paws."
        echo ""
        echo "Options:"
        echo "  --skip-rootfs   Skip base rootfs creation"
        echo "  --skip-kernel   Skip kernel download"
        echo "  --help          Show this help"
        echo ""
        echo "Environment:"
        echo "  FIRECRACKER_VERSION  Firecracker release (default: v1.12.0)"
        echo "  PAWS_DATA_DIR        Data directory (default: /var/lib/paws)"
        echo "  INSTALL_DIR          Binary install dir (default: /usr/local/bin)"
        echo "  ROOTFS_SIZE_MB       Rootfs image size in MB (default: 4096)"
        exit 0
        ;;
      *)
        die "Unknown argument: ${arg}. Use --help for usage."
        ;;
    esac
  done

  echo "PAWS_STAGE:checking_prerequisites"
  check_root
  check_arch
  check_dependencies
  check_kvm

  echo ""
  info "Firecracker version: ${FIRECRACKER_VERSION}"
  info "Data directory: ${PAWS_DATA_DIR}"
  info "Install directory: ${INSTALL_DIR}"
  echo ""

  # Step 1: Install Firecracker binary
  echo "PAWS_STAGE:downloading_firecracker"
  install_firecracker

  # Step 2: Create directory structure
  echo "PAWS_STAGE:creating_directories"
  create_directories

  # Step 3: Generate SSH keys (before rootfs, so we can inject the pubkey)
  echo "PAWS_STAGE:generating_ssh_keys"
  generate_ssh_keys

  # Step 4: Download kernel
  echo "PAWS_STAGE:downloading_kernel"
  if [[ "${skip_kernel}" = false ]]; then
    download_kernel
  else
    warn "Skipping kernel download (--skip-kernel)"
  fi

  # Step 5: Create rootfs
  echo "PAWS_STAGE:creating_rootfs"
  if [[ "${skip_rootfs}" = false ]]; then
    create_rootfs
  else
    warn "Skipping rootfs creation (--skip-rootfs)"
  fi

  echo "PAWS_STAGE:complete"
  echo ""
  info "Installation complete!"
  echo ""
  info "Next steps:"
  info "  1. Build a snapshot:  bun run apps/worker/src/server.ts (then POST /snapshots/build)"
  info "  2. Or run bootstrap:  sudo ./scripts/bootstrap-node.sh"
  echo ""
}

main "$@"
