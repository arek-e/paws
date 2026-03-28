# Getting Started

```
 /\_/\
( o.o )  from zero to paws in five minutes
 > ^ <
```

## Prerequisites

| Tool                                                    | Why                       |
| ------------------------------------------------------- | ------------------------- |
| [Hetzner Cloud account](https://console.hetzner.cloud/) | Server provisioning       |
| [Pulumi CLI](https://www.pulumi.com/docs/install/)      | Infrastructure as code    |
| [Bun](https://bun.sh)                                   | Runtime + package manager |
| [Tailscale](https://tailscale.com) (recommended)        | Secure SSH access         |
| SSH keypair (`~/.ssh/id_ed25519`)                       | Server access             |

## Quick Start

```bash
# Clone and install
git clone https://github.com/arek-e/paws
cd paws && bun install

# Configure Pulumi
cd infra/pulumi
pulumi stack init dev
pulumi config set --secret hcloud:token YOUR_HETZNER_API_TOKEN
pulumi config set paws:sshPublicKey "$(cat ~/.ssh/id_ed25519.pub)"

# Restrict SSH to Tailscale CGNAT range (recommended).
# If omitted, SSH is blocked entirely by the firewall — deny by default.
pulumi config set paws:sshAllowCidr "100.64.0.0/10"

# Deploy
pulumi up
```

This provisions:

- A **control-plane** server running the paws gateway + K8s API server
- One **worker** server with Firecracker, containerd, kubeadm, and KVM ready
- A private network (10.0.0.0/8) between all nodes
- A firewall with SSH restricted to your configured CIDR (or blocked entirely)
- Automatic `kubeadm init` + `kubeadm join` + Flannel CNI + K8s manifest deployment

### Save kubeconfig

```bash
pulumi stack output --show-secrets kubeconfig > ~/.kube/paws.yaml
export KUBECONFIG=~/.kube/paws.yaml
kubectl get nodes
```

## First Workload

```bash
# Get the gateway IP
GATEWAY_IP=$(pulumi stack output gatewayIp)

# Submit a session — runs in an isolated Firecracker VM
curl -X POST "http://${GATEWAY_IP}:4000/v1/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot": "test-minimal",
    "workload": {
      "type": "script",
      "script": "echo hello from paws"
    }
  }'
```

The gateway exposes its OpenAPI spec at `http://<gateway-ip>:4000/openapi.json`.

## Adding Worker Nodes

Scale up by increasing the worker count:

```bash
pulumi config set paws:workerCount 2
pulumi up
```

Or bootstrap a bare-metal server manually with the bootstrap script:

```bash
sudo ./scripts/bootstrap-node.sh \
  --join "$(pulumi stack output --show-secrets joinCommand)" \
  --snapshot-url https://your-storage/snapshot.tar.gz
```

The bootstrap script installs Firecracker, containerd, kubeadm, and joins the cluster. It is
idempotent (safe to run multiple times).

## Credential Configuration

paws uses a zero-trust architecture: **no secrets enter the VM**. Credentials are injected at the
network layer by a per-VM TLS MITM proxy. The agent inside the VM never sees API keys, GitHub
tokens, or any other secret.

See [security.md](security.md) for the full model, including per-VM proxy lifecycle, domain
allowlisting, Git credential injection, and iptables network isolation.

## Configuration Reference

| Config key               | Default             | Description                                                                                                                                                                          |
| ------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hcloud:token`           | (required)          | Hetzner Cloud API token (secret)                                                                                                                                                     |
| `paws:sshPublicKey`      | (required)          | SSH public key for server access                                                                                                                                                     |
| `paws:sshAllowCidr`      | (none -- deny all)  | CIDR for SSH access (e.g. `100.64.0.0/10`)                                                                                                                                           |
| `paws:workerCount`       | `1`                 | Number of worker nodes                                                                                                                                                               |
| `paws:gatewayServerType` | `cx31`              | Hetzner server type for gateway                                                                                                                                                      |
| `paws:workerServerType`  | `cx31`              | Hetzner server type for workers (dev/staging only -- Hetzner Cloud VMs lack /dev/kvm and cannot run Firecracker; production workers need bare metal or AWS EC2 C8i with nested virt) |
| `paws:location`          | `fsn1`              | Hetzner datacenter location                                                                                                                                                          |
| `paws:sshPrivateKeyPath` | `~/.ssh/id_ed25519` | Path to SSH private key on your machine                                                                                                                                              |

## Tearing Down

```bash
cd infra/pulumi
pulumi destroy
```

## Next Steps

- [Architecture](architecture.md) -- full system design
- [Security Model](security.md) -- zero-trust credential injection
- [Testing](testing.md) -- three-tier test strategy
- [Roadmap](roadmap.md) -- what's next
