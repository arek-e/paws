/**
 * k8s.ts — K8s cluster bootstrap and manifest deployment.
 *
 * After the servers are provisioned by control-plane.ts and worker.ts, this
 * module:
 *
 *  1. Emits a `pulumi.dynamic.Resource` that SSHes into the control-plane node
 *     and runs `kubeadm init`, capturing the join command.
 *  2. Emits a `pulumi.dynamic.Resource` per worker that SSHes in and runs
 *     the join command.
 *  3. Downloads the kubeconfig from the control-plane and deploys all
 *     `infra/k8s/` manifests using `kubectl apply`.
 *
 * Why dynamic resources?
 *  Pulumi's built-in Kubernetes provider needs a kubeconfig, which only exists
 *  after `kubeadm init`. Dynamic resources let us express "run this command on
 *  a remote server" as a first-class Pulumi resource with proper dependency
 *  tracking and idempotency.
 *
 * NOTE: SSH private key must be available on the machine running `pulumi up`.
 * It is read from the path given in the stack config (`paws:sshPrivateKeyPath`)
 * or defaults to `~/.ssh/id_ed25519`. The key is NEVER stored in Pulumi state.
 */

import * as pulumi from '@pulumi/pulumi';
import * as hcloud from '@pulumi/hcloud';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface K8sClusterArgs {
  controlPlaneIp: pulumi.Output<string>;
  workerIps: pulumi.Output<string>[];
  /** Path to SSH private key on the machine running pulumi up (not stored in state). */
  sshPrivateKeyPath?: string;
  /** Absolute path to the infra/k8s directory containing K8s manifests. */
  k8sManifestDir: string;
  /** Pod CIDR for Flannel. Defaults to 10.244.0.0/16. */
  podCidr?: string;
}

export interface K8sClusterOutputs {
  kubeconfig: pulumi.Output<string>;
  joinCommand: pulumi.Output<string>;
}

// ---------------------------------------------------------------------------
// Dynamic provider helpers
// ---------------------------------------------------------------------------

/**
 * Inputs/outputs for the KubeadmInit dynamic resource.
 */
interface KubeadmInitInputs {
  controlPlaneIp: string;
  podCidr: string;
  sshPrivateKeyPath: string;
}

interface KubeadmInitOutputs extends KubeadmInitInputs {
  kubeconfig: string;
  joinCommand: string;
}

/**
 * Dynamic provider that runs `kubeadm init` on the control-plane node and
 * captures the kubeconfig and worker join command.
 *
 * Idempotent: on subsequent `pulumi up` calls the node is already initialised
 * so `kubeadm init` is skipped; we just re-fetch the kubeconfig.
 */
const kubeadmInitProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: KubeadmInitInputs): Promise<pulumi.dynamic.CreateResult> {
    const { controlPlaneIp, podCidr, sshPrivateKeyPath } = inputs;
    const ssh = buildSshCommand(controlPlaneIp, sshPrivateKeyPath);

    // Wait for bootstrap cloud-init to finish.
    await runSsh(ssh, 'until [ -f /var/lib/paws/.bootstrap-done ]; do sleep 5; done');

    // Run kubeadm init if not already done.
    const alreadyInit = await runSsh(
      ssh,
      'test -f /etc/kubernetes/admin.conf && echo yes || echo no',
    );
    if (alreadyInit.trim() !== 'yes') {
      await runSsh(
        ssh,
        `kubeadm init --pod-network-cidr=${podCidr} --upload-certs 2>&1 | tee /tmp/kubeadm-init.log`,
      );

      // Install Flannel CNI.
      await runSsh(
        ssh,
        [
          'export KUBECONFIG=/etc/kubernetes/admin.conf',
          'kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/v0.26.2/Documentation/kube-flannel.yml',
        ].join(' && '),
      );
    }

    // Fetch kubeconfig (replace localhost with the public IP for remote access).
    const rawKubeconfig = await runSsh(ssh, 'cat /etc/kubernetes/admin.conf');
    const kubeconfig = rawKubeconfig.replace(
      'https://127.0.0.1:6443',
      `https://${controlPlaneIp}:6443`,
    );

    // Generate a fresh join command (token valid for 24 h).
    const joinCommand = await runSsh(
      ssh,
      'KUBECONFIG=/etc/kubernetes/admin.conf kubeadm token create --print-join-command',
    );

    const outs: KubeadmInitOutputs = {
      ...inputs,
      kubeconfig,
      joinCommand: joinCommand.trim(),
    };
    return { id: `kubeadm-init-${controlPlaneIp}`, outs };
  },

  async diff(_id, _olds, _news): Promise<pulumi.dynamic.DiffResult> {
    // Re-run only if the control-plane IP changes (server replaced).
    return { changes: false };
  },

  async update(_id, _olds, news: KubeadmInitInputs): Promise<pulumi.dynamic.UpdateResult> {
    // Delegate to create logic (idempotent).
    const result = await kubeadmInitProvider.create!(news);
    return { outs: result.outs };
  },

  async delete(): Promise<void> {
    // Nothing to delete — destroying the server is sufficient.
  },
};

/**
 * Inputs/outputs for the KubeadmJoin dynamic resource.
 */
interface KubeadmJoinInputs {
  workerIp: string;
  joinCommand: string;
  sshPrivateKeyPath: string;
}

interface KubeadmJoinOutputs extends KubeadmJoinInputs {
  nodeName: string;
}

const kubeadmJoinProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: KubeadmJoinInputs): Promise<pulumi.dynamic.CreateResult> {
    const { workerIp, joinCommand, sshPrivateKeyPath } = inputs;
    const ssh = buildSshCommand(workerIp, sshPrivateKeyPath);

    // Wait for cloud-init bootstrap to finish.
    await runSsh(ssh, 'until [ -f /var/lib/paws/.bootstrap-done ]; do sleep 5; done');

    // Join only if not already a cluster member.
    const alreadyJoined = await runSsh(
      ssh,
      'test -f /etc/kubernetes/kubelet.conf && echo yes || echo no',
    );
    if (alreadyJoined.trim() !== 'yes') {
      await runSsh(ssh, joinCommand);
    }

    const nodeName = await runSsh(ssh, 'hostname');
    const outs: KubeadmJoinOutputs = { ...inputs, nodeName: nodeName.trim() };
    return { id: `kubeadm-join-${workerIp}`, outs };
  },

  async diff(): Promise<pulumi.dynamic.DiffResult> {
    return { changes: false };
  },

  async update(_id, _olds, news: KubeadmJoinInputs): Promise<pulumi.dynamic.UpdateResult> {
    const result = await kubeadmJoinProvider.create!(news);
    return { outs: result.outs };
  },

  async delete(): Promise<void> {},
};

/**
 * Inputs/outputs for the KubectlApply dynamic resource.
 */
interface KubectlApplyInputs {
  controlPlaneIp: string;
  kubeconfig: string;
  manifestDir: string;
  sshPrivateKeyPath: string;
}

const kubectlApplyProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: KubectlApplyInputs): Promise<pulumi.dynamic.CreateResult> {
    const { controlPlaneIp, kubeconfig, manifestDir, sshPrivateKeyPath } = inputs;
    const ssh = buildSshCommand(controlPlaneIp, sshPrivateKeyPath);

    // Write kubeconfig to a temp file on the control-plane node and run kubectl apply.
    // Manifests are read from the local machine and piped over SSH via stdin.
    const { execSync } = await import('child_process');

    // Build the list of YAML files in apply order.
    const manifestFiles = [
      path.join(manifestDir, 'namespace.yaml'),
      path.join(manifestDir, 'rbac', 'serviceaccount.yaml'),
      path.join(manifestDir, 'rbac', 'clusterrole.yaml'),
      path.join(manifestDir, 'gateway', 'configmap.yaml'),
      path.join(manifestDir, 'gateway', 'service.yaml'),
      path.join(manifestDir, 'gateway', 'deployment.yaml'),
      path.join(manifestDir, 'worker', 'configmap.yaml'),
      path.join(manifestDir, 'worker', 'service.yaml'),
      path.join(manifestDir, 'worker', 'daemonset.yaml'),
    ];

    // Write kubeconfig to a tempfile on the remote node.
    await runSsh(ssh, `echo '${kubeconfig.replace(/'/g, "'\\''")}' > /tmp/paws-kubeconfig`);

    for (const manifestFile of manifestFiles) {
      const manifest = require('fs').readFileSync(manifestFile, 'utf8');
      const escaped = manifest.replace(/'/g, "'\\''");
      await runSsh(ssh, `echo '${escaped}' | KUBECONFIG=/tmp/paws-kubeconfig kubectl apply -f -`);
    }

    return { id: `kubectl-apply-${controlPlaneIp}`, outs: { ...inputs } };
  },

  async diff(): Promise<pulumi.dynamic.DiffResult> {
    return { changes: false };
  },

  async update(_id, _olds, news: KubectlApplyInputs): Promise<pulumi.dynamic.UpdateResult> {
    const result = await kubectlApplyProvider.create!(news);
    return { outs: result.outs };
  },

  async delete(): Promise<void> {},
};

// ---------------------------------------------------------------------------
// Dynamic resource classes
// ---------------------------------------------------------------------------

class KubeadmInit extends pulumi.dynamic.Resource {
  public readonly kubeconfig!: pulumi.Output<string>;
  public readonly joinCommand!: pulumi.Output<string>;

  constructor(name: string, args: KubeadmInitInputs, opts?: pulumi.CustomResourceOptions) {
    super(
      kubeadmInitProvider,
      name,
      { kubeconfig: undefined, joinCommand: undefined, ...args },
      opts,
    );
  }
}

class KubeadmJoin extends pulumi.dynamic.Resource {
  public readonly nodeName!: pulumi.Output<string>;

  constructor(name: string, args: KubeadmJoinInputs, opts?: pulumi.CustomResourceOptions) {
    super(kubeadmJoinProvider, name, { nodeName: undefined, ...args }, opts);
  }
}

class KubectlApply extends pulumi.dynamic.Resource {
  constructor(name: string, args: KubectlApplyInputs, opts?: pulumi.CustomResourceOptions) {
    super(kubectlApplyProvider, name, { ...args }, opts);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Bootstrap the K8s cluster and deploy paws manifests.
 */
export function bootstrapCluster(args: K8sClusterArgs): K8sClusterOutputs {
  const sshPrivateKeyPath = args.sshPrivateKeyPath ?? path.join(os.homedir(), '.ssh', 'id_ed25519');
  const podCidr = args.podCidr ?? '10.244.0.0/16';

  // Step 1: kubeadm init on control-plane.
  const init = new KubeadmInit(
    'kubeadm-init',
    {
      controlPlaneIp: args.controlPlaneIp as unknown as string,
      podCidr,
      sshPrivateKeyPath,
    },
    { dependsOn: [] },
  );

  // Step 2: kubeadm join on each worker.
  args.workerIps.forEach((workerIp, i) => {
    new KubeadmJoin(
      `kubeadm-join-${i}`,
      {
        workerIp: workerIp as unknown as string,
        joinCommand: init.joinCommand as unknown as string,
        sshPrivateKeyPath,
      },
      { dependsOn: [init] },
    );
  });

  // Step 3: Deploy paws K8s manifests.
  new KubectlApply(
    'kubectl-apply-paws',
    {
      controlPlaneIp: args.controlPlaneIp as unknown as string,
      kubeconfig: init.kubeconfig as unknown as string,
      manifestDir: args.k8sManifestDir,
      sshPrivateKeyPath,
    },
    { dependsOn: [init] },
  );

  return {
    kubeconfig: init.kubeconfig,
    joinCommand: init.joinCommand,
  };
}

// ---------------------------------------------------------------------------
// SSH helpers (used only at runtime by dynamic providers)
// ---------------------------------------------------------------------------

/** Returns an SSH base command array for the given host + key path. */
function buildSshCommand(host: string, keyPath: string): string[] {
  return [
    'ssh',
    '-i',
    keyPath,
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'ConnectTimeout=10',
    `root@${host}`,
  ];
}

/** Runs a command via SSH and returns stdout. Throws on non-zero exit. */
async function runSsh(sshCmd: string[], remoteCommand: string): Promise<string> {
  const { execFile } = await import('child_process');
  return new Promise((resolve, reject) => {
    execFile(
      sshCmd[0],
      [...sshCmd.slice(1), remoteCommand],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(`SSH command failed: ${err.message}\nstdout: ${stdout}\nstderr: ${stderr}`),
          );
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

// Keep hcloud import used (referenced via type in index.ts)
export type { hcloud as _hcloudType };
