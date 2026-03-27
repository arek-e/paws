/**
 * infra/pulumi/index.ts — paws cluster provisioning program.
 *
 * Run with:
 *   cd infra/pulumi
 *   pulumi stack select dev          # or: pulumi stack init dev
 *   pulumi config set --secret hcloud:token <TOKEN>
 *   pulumi config set paws:sshPublicKey "$(cat ~/.ssh/id_ed25519.pub)"
 *   pulumi up
 *
 * What pulumi up does:
 *   1.  Create an SSH key resource on Hetzner Cloud.
 *   2.  Create a private network + firewall.
 *   3.  Provision the control-plane (gateway) server — cx31, Ubuntu 24.04.
 *       cloud-init installs containerd + kubeadm but does NOT call kubeadm init.
 *   4.  Provision N worker servers (workerCount from stack config).
 *       cloud-init installs containerd + kubeadm + Firecracker.
 *   5.  SSH into the control-plane, run `kubeadm init`, install Flannel CNI.
 *   6.  SSH into each worker, run `kubeadm join`.
 *   7.  kubectl apply all manifests from infra/k8s/ in dependency order.
 *
 * Outputs:
 *   gatewayIp     — public IPv4 of the control-plane node
 *   workerIps     — public IPv4s of each worker node
 *   kubeconfig    — kubeconfig for the cluster (secret, redacted in console)
 *
 * Notes on dedicated servers (AX41 bare-metal):
 *   There is no official Pulumi provider for Hetzner Robot. For production
 *   worker nodes, provision them via the Hetzner Robot web UI or the
 *   providers/hetzner-dedicated package, then register them with kubeadm join
 *   manually. The Pulumi program handles the Hetzner Cloud case (dev/staging).
 */

import * as pulumi from '@pulumi/pulumi';
import * as hcloud from '@pulumi/hcloud';
import * as path from 'path';

import { createNetwork, attachToNetwork, attachFirewall } from './src/network';
import { createControlPlane } from './src/control-plane';
import { createWorker } from './src/worker';
import { bootstrapCluster } from './src/k8s';

// ---------------------------------------------------------------------------
// Stack configuration
// ---------------------------------------------------------------------------

const config = new pulumi.Config('paws');
const hcloudConfig = new pulumi.Config('hcloud');

const workerCount = config.getNumber('workerCount') ?? 1;
const gatewayServerType = config.get('gatewayServerType') ?? 'cx31';
const workerServerType = config.get('workerServerType') ?? 'cx31';
const location = config.get('location') ?? 'fsn1';
const sshPublicKey = config.require('sshPublicKey');

// SSH private key path — not stored in state; read from local filesystem at runtime.
const sshPrivateKeyPath =
  config.get('sshPrivateKeyPath') ?? `${process.env['HOME']}/.ssh/id_ed25519`;

// The hcloud token is consumed automatically by the @pulumi/hcloud provider.
// Declare it here only to surface a clear error if it's missing.
const _hcloudToken = hcloudConfig.requireSecret('token');

// ---------------------------------------------------------------------------
// SSH key
// ---------------------------------------------------------------------------

const sshKey = new hcloud.SshKey('paws-deploy-key', {
  name: 'paws-deploy',
  publicKey: sshPublicKey,
  labels: {
    'app.kubernetes.io/name': 'paws',
    'app.kubernetes.io/managed-by': 'pulumi',
  },
});

// ---------------------------------------------------------------------------
// Network + firewall
// ---------------------------------------------------------------------------

const { network, subnet: _subnet, clusterFirewall } = createNetwork();

// ---------------------------------------------------------------------------
// Control-plane server (gateway)
// ---------------------------------------------------------------------------

const controlPlane = createControlPlane({
  serverType: gatewayServerType,
  location,
  sshKeyId: sshKey.id,
  firewallId: clusterFirewall.id.apply((id) => Number(id)),
});

// Attach to private network at 10.0.1.10 (deterministic control-plane IP).
attachToNetwork(controlPlane.server, network, '10.0.1.10');
attachFirewall(controlPlane.server, clusterFirewall);

// ---------------------------------------------------------------------------
// Worker servers
// ---------------------------------------------------------------------------

const workers = Array.from({ length: workerCount }, (_, i) => {
  const worker = createWorker({
    index: i,
    serverType: workerServerType,
    location,
    sshKeyId: sshKey.id,
    firewallId: clusterFirewall.id.apply((id) => Number(id)),
  });

  // Assign private IPs starting at 10.0.1.21, 10.0.1.22, …
  attachToNetwork(worker.server, network, `10.0.1.${21 + i}`);
  attachFirewall(worker.server, clusterFirewall);

  return worker;
});

// ---------------------------------------------------------------------------
// K8s bootstrap + manifest deployment
// ---------------------------------------------------------------------------

// Absolute path to the infra/k8s directory so dynamic providers can read
// manifests from the local machine during pulumi up.
const k8sManifestDir = path.resolve(__dirname, '..', 'k8s');

const cluster = bootstrapCluster({
  controlPlaneIp: controlPlane.publicIp,
  workerIps: workers.map((w) => w.publicIp),
  sshPrivateKeyPath,
  k8sManifestDir,
});

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Public IPv4 of the control-plane / gateway node. */
export const gatewayIp = controlPlane.publicIp;

/** Public IPv4s of each worker node. */
export const workerIps = pulumi.all(workers.map((w) => w.publicIp));

/**
 * kubeconfig for the cluster.
 * Marked secret — Pulumi will redact it in console output and encrypt it in state.
 */
export const kubeconfig = pulumi.secret(cluster.kubeconfig);

/**
 * kubeadm join command for manually adding extra nodes.
 * Marked secret — contains a bootstrap token.
 */
export const joinCommand = pulumi.secret(cluster.joinCommand);

/**
 * Quick-start instructions printed after `pulumi up`.
 */
export const clusterInfo = pulumi
  .all([gatewayIp, workerIps])
  .apply(([gw, wks]) =>
    [
      '',
      '=== paws cluster ready ===',
      `  Gateway / control-plane: ${gw}`,
      `  Workers: ${wks.join(', ')}`,
      '',
      'Save kubeconfig:',
      '  pulumi stack output --show-secrets kubeconfig > ~/.kube/paws.yaml',
      '  export KUBECONFIG=~/.kube/paws.yaml',
      '',
      'Verify:',
      '  kubectl get nodes',
      '  kubectl get pods -n paws',
      '',
      'Create the gateway API key secret before deploying:',
      '  kubectl create secret generic paws-gateway-secret --from-literal=api-key=<VALUE> -n paws',
      '========================',
    ].join('\n'),
  );
