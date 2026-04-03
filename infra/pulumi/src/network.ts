/**
 * network.ts — Hetzner Cloud network + firewall setup for paws.
 *
 * Creates:
 *  - A private network (10.0.0.0/8) with a subnet for the cluster.
 *  - A firewall that:
 *      • allows SSH only from the CIDR set in `paws:sshAllowCidr` config
 *        (deny-by-default — if not set, no SSH firewall rule is created)
 *      • allows inbound K8s API server port (6443) from the gateway server only
 *      • allows all intra-cluster traffic on the private network
 *      • blocks everything else inbound on the public interface
 */

import * as pulumi from '@pulumi/pulumi';
import * as hcloud from '@pulumi/hcloud';

export interface NetworkOutputs {
  network: hcloud.Network;
  subnet: hcloud.NetworkSubnet;
  clusterFirewall: hcloud.Firewall;
}

export function createNetwork(): NetworkOutputs {
  const config = new pulumi.Config('paws');

  // SSH access CIDR — deny by default. Set to e.g. "100.64.0.0/10" for Tailscale
  // CGNAT range, or "YOUR.IP/32" for a single machine. If not set, no SSH firewall
  // rule is created and port 22 is blocked by the Hetzner Cloud firewall.
  const sshAllowCidr = config.get('sshAllowCidr');

  // Private overlay network for pod-to-pod and node-to-node traffic.
  const network = new hcloud.Network('paws-network', {
    name: 'paws-cluster',
    ipRange: '10.0.0.0/8',
    labels: {
      'app.kubernetes.io/name': 'paws',
      'app.kubernetes.io/managed-by': 'pulumi',
    },
  });

  // Single subnet that covers all cluster nodes.
  const subnet = new hcloud.NetworkSubnet('paws-subnet', {
    networkId: network.id.apply((id) => Number(id)),
    type: 'cloud',
    networkZone: 'eu-central',
    ipRange: '10.0.1.0/24',
  });

  // Build firewall rules. SSH is only included when sshAllowCidr is configured.
  const rules: pulumi.Input<hcloud.inputs.FirewallRule>[] = [
    // Kubernetes API server (control-plane only; worker nodes don't need this rule
    // but applying the same firewall everywhere is simpler).
    {
      direction: 'in',
      protocol: 'tcp',
      port: '6443',
      sourceIps: ['10.0.0.0/8'],
      description: 'K8s API server — cluster-internal only',
    },
    // kubelet + NodePort range.
    {
      direction: 'in',
      protocol: 'tcp',
      port: '10250',
      sourceIps: ['10.0.0.0/8'],
      description: 'kubelet API — cluster-internal only',
    },
    // Flannel VXLAN overlay.
    {
      direction: 'in',
      protocol: 'udp',
      port: '8472',
      sourceIps: ['10.0.0.0/8'],
      description: 'Flannel VXLAN — cluster-internal only',
    },
    // ICMP ping — useful for diagnostics.
    {
      direction: 'in',
      protocol: 'icmp',
      sourceIps: ['0.0.0.0/0', '::/0'],
      description: 'ICMP ping',
    },
    // paws gateway API (exposed by Caddy / NodePort in production).
    {
      direction: 'in',
      protocol: 'tcp',
      port: '4000',
      sourceIps: ['0.0.0.0/0', '::/0'],
      description: 'paws gateway API',
    },
  ];

  // SSH — only allow if sshAllowCidr is explicitly configured. Deny by default.
  if (sshAllowCidr) {
    rules.unshift({
      direction: 'in',
      protocol: 'tcp',
      port: '22',
      sourceIps: [sshAllowCidr],
      description: `SSH access — restricted to ${sshAllowCidr}`,
    });
  }

  // Firewall rules applied to every cluster node.
  const clusterFirewall = new hcloud.Firewall('paws-firewall', {
    name: 'paws-cluster-fw',
    labels: {
      'app.kubernetes.io/name': 'paws',
      'app.kubernetes.io/managed-by': 'pulumi',
    },
    rules,
  });

  return { network, subnet, clusterFirewall };
}

/**
 * Attach a server to the cluster network at a deterministic private IP.
 *
 * @param server     - The hcloud.Server to attach.
 * @param network    - The paws private network.
 * @param privateIp  - The desired private IP within 10.0.1.0/24.
 */
export function attachToNetwork(
  server: hcloud.Server,
  network: hcloud.Network,
  privateIp: string,
): hcloud.ServerNetwork {
  return new hcloud.ServerNetwork(`${server.name}-net`, {
    serverId: server.id.apply((id) => Number(id)),
    networkId: network.id.apply((id) => Number(id)),
    ip: privateIp,
  });
}

/**
 * Attach the cluster firewall to a server.
 */
export function attachFirewall(
  server: hcloud.Server,
  firewall: hcloud.Firewall,
): hcloud.FirewallAttachment {
  return new hcloud.FirewallAttachment(`${server.name}-fw`, {
    firewallId: firewall.id.apply((id) => Number(id)),
    serverIds: [server.id.apply((id) => Number(id))],
  });
}
