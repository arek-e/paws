/**
 * worker.ts — Provisions worker nodes (Hetzner Cloud).
 *
 * Each worker node runs:
 *  - containerd + kubeadm (joins the K8s cluster)
 *  - Firecracker binary (installed by bootstrap-node.sh or cloud-init)
 *  - paws worker DaemonSet pod (via K8s)
 *
 * Notes on dedicated servers (AX41):
 *  There is no official Pulumi provider for Hetzner Robot (dedicated server API).
 *  For production bare-metal workers, provision them manually or via the
 *  providers/hetzner-dedicated package, then register them in the cluster with
 *  kubeadm join. This file handles the Hetzner Cloud case (cx31 dev/staging).
 */

import * as pulumi from '@pulumi/pulumi';
import * as hcloud from '@pulumi/hcloud';

export interface WorkerArgs {
  index: number;
  serverType: pulumi.Input<string>;
  location: pulumi.Input<string>;
  /** SSH key ID as a string (hcloud sshKeys field accepts string IDs or names). */
  sshKeyId: pulumi.Input<string>;
  firewallId: pulumi.Input<number>;
}

export interface WorkerOutputs {
  server: hcloud.Server;
  publicIp: pulumi.Output<string>;
}

/**
 * Cloud-init script for worker nodes.
 *
 * Installs:
 *  - containerd (container runtime)
 *  - kubeadm / kubelet / kubectl
 *  - Firecracker binary + jailer
 *  - KVM dependencies
 *
 * Does NOT call `kubeadm join` — that is done in k8s.ts after the control-plane
 * emits a join command.
 */
const workerCloudInit = `#!/bin/bash
set -euo pipefail

# ----- system baseline -----
apt-get update -qq
apt-get install -y -qq curl gnupg lsb-release apt-transport-https ca-certificates \
  qemu-kvm libvirt-daemon-system virtinst cpu-checker

# IP forwarding + bridge netfilter.
cat <<'EOF' > /etc/sysctl.d/99-paws.conf
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF
modprobe overlay
modprobe br_netfilter
modprobe kvm_amd || modprobe kvm_intel || true
sysctl --system

# ----- containerd -----
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq containerd.io

mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
systemctl restart containerd
systemctl enable containerd

# ----- kubeadm / kubelet / kubectl -----
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key \
  | gpg --dearmor -o /etc/apt/keyrings/kubernetes.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes.gpg] \
  https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /" \
  > /etc/apt/sources.list.d/kubernetes.list
apt-get update -qq
apt-get install -y -qq kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl
systemctl enable kubelet

swapoff -a
sed -i '/swap/d' /etc/fstab

# ----- Firecracker -----
FIRECRACKER_VERSION="v1.6.0"
ARCH="\$(uname -m)"
RELEASE_URL="https://github.com/firecracker-microvm/firecracker/releases/download"

curl -fsSL \
  "\${RELEASE_URL}/\${FIRECRACKER_VERSION}/firecracker-\${FIRECRACKER_VERSION}-\${ARCH}.tgz" \
  -o /tmp/firecracker.tgz
tar -xzf /tmp/firecracker.tgz -C /tmp
mv "/tmp/release-\${FIRECRACKER_VERSION}-\${ARCH}/firecracker-\${FIRECRACKER_VERSION}-\${ARCH}" \
  /usr/local/bin/firecracker
mv "/tmp/release-\${FIRECRACKER_VERSION}-\${ARCH}/jailer-\${FIRECRACKER_VERSION}-\${ARCH}" \
  /usr/local/bin/jailer
chmod +x /usr/local/bin/firecracker /usr/local/bin/jailer
rm -rf /tmp/firecracker.tgz "/tmp/release-\${FIRECRACKER_VERSION}-\${ARCH}"

# ----- paws directories -----
mkdir -p /var/lib/paws/{snapshots,vms,ssh,state}

touch /var/lib/paws/.bootstrap-done
`;

export function createWorker(args: WorkerArgs): WorkerOutputs {
  const name = `paws-worker-${args.index}`;

  const server = new hcloud.Server(name, {
    name,
    serverType: args.serverType,
    image: 'ubuntu-24.04',
    location: args.location,
    sshKeys: [args.sshKeyId],
    firewallIds: [args.firewallId],
    userData: workerCloudInit,
    labels: {
      'app.kubernetes.io/name': 'paws',
      'app.kubernetes.io/component': 'worker',
      'app.kubernetes.io/managed-by': 'pulumi',
      'paws/worker-index': String(args.index),
    },
    // Keep server on destroy to avoid data loss — use `pulumi destroy --target` for explicit removal.
  });

  return {
    server,
    publicIp: server.ipv4Address,
  };
}
