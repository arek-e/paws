/**
 * control-plane.ts — Provisions the gateway / K8s control-plane node.
 *
 * Responsibilities:
 *  - Hetzner Cloud server (cx31, Ubuntu 24.04 by default).
 *  - Cloud-init user-data that installs containerd + kubeadm toolchain.
 *  - Does NOT run `kubeadm init` — that happens in k8s.ts after the server
 *    is reachable, so we can capture the join token as a Pulumi Output.
 */

import * as pulumi from '@pulumi/pulumi';
import * as hcloud from '@pulumi/hcloud';

export interface ControlPlaneArgs {
  serverType: pulumi.Input<string>;
  location: pulumi.Input<string>;
  /** SSH key ID as a string (hcloud sshKeys field accepts string IDs or names). */
  sshKeyId: pulumi.Input<string>;
  firewallId: pulumi.Input<number>;
}

export interface ControlPlaneOutputs {
  server: hcloud.Server;
  publicIp: pulumi.Output<string>;
}

/**
 * Cloud-init script that prepares the node for kubeadm.
 * It does NOT call `kubeadm init` — that is deferred to k8s.ts so that
 * Pulumi can capture the join token.
 */
const controlPlaneCloudInit = `#!/bin/bash
set -euo pipefail

# ----- system baseline -----
apt-get update -qq
apt-get install -y -qq curl gnupg lsb-release apt-transport-https ca-certificates

# IP forwarding (required by K8s networking and Firecracker TAP devices).
cat <<'EOF' > /etc/sysctl.d/99-paws.conf
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF
modprobe overlay
modprobe br_netfilter
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

# containerd config — enable SystemdCgroup so kubelet and containerd agree.
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

# Disable swap (K8s requirement).
swapoff -a
sed -i '/swap/d' /etc/fstab

touch /var/lib/paws/.bootstrap-done
`;

export function createControlPlane(args: ControlPlaneArgs): ControlPlaneOutputs {
  const server = new hcloud.Server('paws-gateway', {
    name: 'paws-gateway',
    serverType: args.serverType,
    image: 'ubuntu-24.04',
    location: args.location,
    sshKeys: [args.sshKeyId],
    firewallIds: [args.firewallId],
    userData: controlPlaneCloudInit,
    labels: {
      'app.kubernetes.io/name': 'paws',
      'app.kubernetes.io/component': 'gateway',
      'app.kubernetes.io/managed-by': 'pulumi',
    },
    // Keep server on destroy to avoid data loss — use `pulumi destroy --target` for explicit removal.
  });

  return {
    server,
    publicIp: server.ipv4Address,
  };
}
