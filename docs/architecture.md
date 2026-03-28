# Architecture

```
 /\_/\
( o.o )  paws architecture
 > ^ <
```

## Overview

paws is a zero-trust credential injection layer for AI agents. The core idea: your agent never sees
an API key. Credentials are held on the host and injected at the network layer by a per-VM TLS MITM
proxy — the agent makes normal HTTPS requests and auth headers appear transparently.

This trust architecture is enforced by running each agent in an ephemeral Firecracker microVM with
its own dedicated proxy, its own network namespace, and its own ephemeral CA. Two core services — a
**gateway** (control plane) and **workers** (execution nodes) — coordinate the lifecycle, connected
by a Kubernetes-orchestrated network.

The design follows Browser Use's "Pattern 2: Agent Isolation" — the entire agent runs in a sandbox
with zero secrets, talking to the outside world through a control plane that holds all credentials.

## Core Principles

1. **Zero secrets in the VM** — the agent has nothing worth stealing
2. **Per-VM isolation** — every session gets its own proxy, its own network namespace, its own
   credentials
3. **Ephemeral execution** — VMs are created per trigger event, destroyed after completion
4. **Persistent memory** — state survives across invocations via gateway DB + mounted volumes
5. **Spec-first API** — OpenAPI spec is the source of truth, SDKs generated from it

## System Components

```
┌──────────────────────────────────────────────────┐
│                    Gateway                        │
│                                                   │
│  ┌─────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ API     │ │ Trigger  │ │ LLM History       │  │
│  │ (Hono + │ │ Engine   │ │ Store             │  │
│  │ OpenAPI)│ │ (webhook,│ │ (per-daemon       │  │
│  │         │ │  cron,   │ │  conversation     │  │
│  │         │ │  watch)  │ │  context)         │  │
│  └─────────┘ └──────────┘ └───────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Session │ │ Daemon   │ │ Scheduler         │  │
│  │ Tracker │ │ Registry │ │ (least-loaded     │  │
│  │         │ │          │ │  worker selection) │  │
│  └─────────┘ └──────────┘ └───────────────────┘  │
│  ┌──────────────────────────────────────────────┐ │
│  │ Governance: rate limits, approval gates,     │ │
│  │ audit log, per-daemon policy                 │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
 ┌────────┴─────────┐    ┌────────┴─────────┐
 │   Worker Node 1  │    │   Worker Node N  │
 │                   │    │                   │
 │  ┌─────────────┐  │    │  ┌─────────────┐  │
 │  │ Worker      │  │    │  │ Worker      │  │
 │  │ Service     │  │    │  │ Service     │  │
 │  │ (Hono)      │  │    │  │ (Hono)      │  │
 │  └──────┬──────┘  │    │  └──────┬──────┘  │
 │         │         │    │         │         │
 │  ┌──────┴──────┐  │    │  ┌──────┴──────┐  │
 │  │ VM 1        │  │    │  │ VM 1        │  │
 │  │ ┌─────────┐ │  │    │  │ ┌─────────┐ │  │
 │  │ │ Proxy 1 │ │  │    │  │ │ Proxy 1 │ │  │
 │  │ └─────────┘ │  │    │  │ └─────────┘ │  │
 │  │ ┌─────────┐ │  │    │  │ ┌─────────┐ │  │
 │  │ │ FC VM 1 │ │  │    │  │ │ FC VM 1 │ │  │
 │  │ └─────────┘ │  │    │  │ └─────────┘ │  │
 │  └─────────────┘  │    │  └─────────────┘  │
 │  ┌─────────────┐  │    │                   │
 │  │ VM 2        │  │    │  /var/lib/paws/   │
 │  │ ┌─────────┐ │  │    │  ├── snapshots/   │
 │  │ │ Proxy 2 │ │  │    │  ├── state/       │
 │  │ └─────────┘ │  │    │  └── vms/         │
 │  │ ┌─────────┐ │  │    │                   │
 │  │ │ FC VM 2 │ │  │    └───────────────────┘
 │  │ └─────────┘ │  │
 │  └─────────────┘  │
 │                   │
 │  /var/lib/paws/   │
 │  ├── snapshots/   │
 │  ├── state/       │
 │  │   └── pr-helper/ (persistent volume)
 │  └── vms/         │
 └───────────────────┘
```

## Two Execution Models

### Sessions (one-shot)

Run a workload, get a result, VM destroyed.

```
POST /v1/sessions
  → gateway authenticates request
  → scheduler picks least-loaded worker
  → worker restores VM from snapshot (<1s)
  → worker spawns isolated TLS proxy for this VM
  → iptables DNAT routes VM traffic through proxy
  → worker SSHs into VM, writes script + env
  → script runs, result collected
  → VM + proxy destroyed
  → result returned (or POSTed to callbackUrl)
```

### Daemons (persistent roles)

A daemon is a _definition_ stored in the gateway — not a persistent VM. When a trigger fires, the
gateway creates a session for it.

```
Trigger fires (webhook / cron / watch)
  → gateway checks governance (rate limit, approval)
  → gateway creates a session with the daemon's workload config
  → same flow as a session, but:
    - TRIGGER_PAYLOAD env var contains the event data
    - /state volume mounted (persistent across invocations)
    - LLM conversation history restored from gateway DB
  → VM destroyed after completion
  → state volume + LLM history persist for next invocation
```

A daemon accumulates context not by staying alive, but through:

1. **LLM history** — gateway stores conversation context (transparent, since it proxies all LLM
   calls)
2. **State volume** — `/state` directory persists across invocations (cloned repos, config, cache)

## Security Model

See [security.md](security.md) for the full model. Summary:

### Zero Secrets in the VM

The VM receives exactly two values at boot:

- `SESSION_TOKEN` — identifies this session to the gateway
- `GATEWAY_URL` — how to reach the control plane (for status reporting)

All credentials (API keys, GitHub tokens, etc.) are held by the per-VM TLS proxy on the host. The
agent makes normal HTTPS requests; the proxy intercepts and injects auth headers.

### Per-VM TLS MITM Proxy

Each VM gets its own proxy process on the host:

```
VM (172.16.x.2)
  → HTTPS request to api.anthropic.com:443
    → iptables DNAT → proxy at 172.16.x.1:8443
      → proxy checks: is api.anthropic.com allowlisted?
        → yes: terminate TLS, inject x-api-key header, forward to real destination
        → no: drop connection
```

- **One proxy per VM** — proxy only knows its own session's secrets
- **Per-session ephemeral CA** — ECDSA P-256 cert, injected into VM trust store
- **Selective interception** — only allowlisted domains get TLS-terminated; others blocked
- **Proxy lifecycle** — spawned with VM, killed with VM

### Network Isolation

```
Per VM:
  - Dedicated TAP device (tap0, tap1, ...)
  - /30 subnet (172.16.x.1 host, 172.16.x.2 guest)
  - iptables: DNAT 80/443 → per-VM proxy
  - iptables: DROP all other outbound
  - No direct internet access
```

## Worker Connectivity

Workers connect to the control plane via Pangolin WireGuard tunnels. Each worker runs
Newt (Pangolin's tunnel agent) which establishes an encrypted tunnel back to Gerbil on
the control plane VPS.

```
Control Plane VPS
├── Pangolin (tunnel control plane + dashboard)
├── Gerbil (WireGuard tunnel server, :51820/udp)
├── Traefik (reverse proxy, :80/:443)
├── Control Plane (API + dashboard, :4000)
├── Dex (OIDC, :5556)
└── VictoriaMetrics + Grafana (metrics)

        ↕ WireGuard tunnel

Worker (bare metal, anywhere)
├── Newt (tunnel agent → connects to Gerbil)
├── Worker process (:3000)
└── Firecracker VMs
```

### Discovery

The control plane discovers workers by polling Pangolin's API for connected sites:

```
Pangolin API: GET /api/v1/org/{orgId}/sites
  → filter to online: true sites
  → extract tunnel IP from subnet field
  → health-check worker at http://{tunnelIP}:3000/health
  → add to fleet registry
```

Four discovery layers (first match wins):

1. **Pangolin** — tunnel-connected workers (primary)
2. **Call-home registry** — WebSocket-connected workers (legacy)
3. **K8s pod discovery** — in-cluster Kubernetes deployments
4. **Static URL** — manual WORKER_URL env var (dev/single-node)

### Worker Onboarding

```bash
# On the worker machine:
curl -fsSL https://raw.githubusercontent.com/arek-e/paws/main/scripts/setup-worker.sh | bash
# Prompts for: Site ID, Site Secret, Pangolin Endpoint
# Installs: Newt + paws worker + Firecracker
# Starts: paws-newt.service + paws-worker.service
```

## VM Lifecycle (per session)

```
1. Allocate network      → TAP device + /30 subnet
2. Spawn TLS proxy       → bound to 172.16.x.1:8443, loaded with session credentials
3. iptables rules        → DNAT 80/443 to proxy, DROP everything else
4. Restore VM            → cp --reflink=auto disk, spawn firecracker, load snapshot, resume
5. Wait SSH              → poll guest at 172.16.x.2:22
6. Write workload        → SSH: write env vars + script to /tmp/run.sh
7. Execute               → SSH: bash /tmp/run.sh (with timeout)
8. Collect result        → SSH: read stdout/stderr + /output/result.json
9. Stop VM               → kill firecracker process
10. Kill proxy           → kill proxy process
11. Teardown network     → remove iptables rules, destroy TAP device
```

Steps 9-11 always run, even on failure (guaranteed cleanup).

## Firecracker Snapshot Boot

Each snapshot contains:

- `vmlinux` — Linux kernel (~40 MB)
- `disk.ext4` — root filesystem with pre-installed tools (~4 GB)
- `memory.snap` — full memory state (~4 GB)
- `vmstate.snap` — CPU register state (~30 KB)

On restore:

1. Copy `disk.ext4` with CoW (`cp --reflink=auto`) — instant on btrfs/xfs, fast copy on ext4
2. Spawn `firecracker --api-sock /path/to/sock`
3. `PUT /snapshot/load` with memory + vmstate paths
4. `PATCH /vm { state: "Resumed" }`

The VM resumes exactly where it was snapshotted — all processes running, memory warm, network up.
Boot time: **<1 second** (28ms with userfaultfd lazy loading).

## Persistent State

### Layer 1: LLM Conversation History (gateway)

The gateway proxies all LLM calls (since it's the MITM proxy path). It stores the conversation per
daemon role:

```
Invocation 1: agent sends messages A, B → gateway stores [A, B, response_A, response_B]
Invocation 2: agent sends message C → gateway reconstructs [A, B, resp_A, resp_B, C] → sends full context to LLM
```

The agent doesn't manage this — it happens transparently. If a VM dies mid-conversation, the history
survives.

### Layer 2: State Volume (worker node)

Each daemon role gets a persistent directory on the worker node:

```
/var/lib/paws/state/{role}/
  ├── repo/          ← cloned git repository (persists, just git pull on next run)
  ├── config/        ← daemon-specific config files
  └── cache/         ← any cached data
```

Mounted into the VM at `/state`. First invocation: empty. Subsequent invocations: pick up where the
last one left off.

**Node affinity (v0.1):** daemon pinned to a specific worker node. The scheduler always routes that
daemon's sessions to the same node so the volume is available.

**Future:** sync state to object storage between invocations for cross-node portability.

## Gateway API

Spec-first design using `@hono/zod-openapi`. Full reference in [api.md](api.md).

### Sessions

```
POST   /v1/sessions              Submit workload → 202 { sessionId }
GET    /v1/sessions/:id          Poll status / get result
DELETE /v1/sessions/:id          Cancel running session
```

### Daemons

```
POST   /v1/daemons               Register + activate a daemon
GET    /v1/daemons                List all active daemons
GET    /v1/daemons/:role          Status + recent actions
PATCH  /v1/daemons/:role          Update config
DELETE /v1/daemons/:role          Stop daemon
```

### Triggers

```
POST   /v1/webhooks/:role         Receive webhook → trigger daemon
```

### Fleet

```
GET    /v1/fleet                  Fleet overview
GET    /v1/fleet/workers          All workers with health
```

### Snapshots

```
POST   /v1/snapshots/:id/build    Build a snapshot from config
GET    /v1/snapshots               List available snapshots
```

## Scheduler (`packages/scheduler`)

Pure TypeScript package — no I/O, no side effects. Used by the gateway to pick which worker node
receives a new session.

### API

```typescript
// Select the least-loaded healthy worker from a fleet snapshot.
// Returns null if no healthy worker has available capacity.
selectWorker(workers: Worker[]): Worker | null

// Compute available capacity for a single worker.
// available = maxConcurrent - running - queued
workerAvailableCapacity(worker: Worker): number
```

### Selection algorithm

1. Filter to workers with `status === 'healthy'`
2. Filter to workers where `availableCapacity > 0`
3. Pick the worker with the highest available capacity (least loaded)
4. Tie-break: first in array wins (stable, deterministic)

The gateway passes a fleet snapshot from `GET /v1/fleet/workers` into `selectWorker` when routing a
new session. Node affinity (pinning a daemon to a specific worker) is enforced before calling the
scheduler — the scheduler only sees the candidate set.

## Provider System (`providers/core`)

Pure TypeScript package — no I/O, no side effects. Defines the contract all host providers must
implement and a simple registry for looking them up at runtime.

### HostProvider interface

```typescript
interface HostProvider {
  readonly name: string; // e.g. "hetzner-dedicated", "hetzner-cloud"
  createHost(opts: CreateHostOpts): ResultAsync<Host, ProvidersError>;
  getHost(hostId: string): ResultAsync<Host, ProvidersError>;
  listHosts(): ResultAsync<Host[], ProvidersError>;
  deleteHost(hostId: string): ResultAsync<void, ProvidersError>;
}
```

### ProviderRegistry

```typescript
// Create a registry, register providers, look them up by name
const registry = createProviderRegistry();
registry.register(hetznerDedicatedProvider);
const provider = registry.get('hetzner-dedicated'); // HostProvider | null
registry.list(); // HostProvider[]
```

Providers are registered at startup. The provisioning layer (Pulumi program) calls
`registry.get(name)` to resolve the right provider before creating or deleting hosts.

### Error handling

`ProvidersError` carries a typed `ProvidersErrorCode` — `PROVIDER_NOT_FOUND`, `HOST_NOT_FOUND`,
`PROVISION_FAILED`, `API_ERROR`, `INVALID_CONFIG`. All fallible methods return `ResultAsync` (never
throw).

## Technology Stack

| Component       | Technology                             |
| --------------- | -------------------------------------- |
| Language        | TypeScript (Bun runtime)               |
| HTTP framework  | Hono + @hono/zod-openapi               |
| VM runtime      | Firecracker (KVM)                      |
| Error handling  | neverthrow (ResultAsync)               |
| Validation      | Zod                                    |
| API spec        | OpenAPI 3.1 (auto-generated from code) |
| SDK generation  | openapi-generator (50+ languages)      |
| Orchestration   | Kubernetes (kubeadm) — v0.2+           |
| IaC             | Pulumi (TypeScript) — v0.2+            |
| Build system    | Turborepo                              |
| Package manager | Bun                                    |

## Monorepo Structure

```
paws/
├── packages/
│   ├── types/              @paws/types        Shared Zod schemas
│   ├── firecracker/        @paws/firecracker  VM lifecycle library
│   └── scheduler/          @paws/scheduler    Fleet scheduling (pure functions)
│
├── apps/
│   ├── worker/             @paws/worker       Worker service (DaemonSet)
│   │   ├── src/
│   │   │   ├── server.ts          Bun entrypoint + config
│   │   │   ├── routes.ts          Hono routes (health, sessions)
│   │   │   ├── semaphore.ts       Counting semaphore with FIFO queue
│   │   │   ├── errors.ts          Typed WorkerError with error codes
│   │   │   ├── session/
│   │   │   │   └── executor.ts    Full VM lifecycle orchestration
│   │   │   ├── ssh/
│   │   │   │   └── client.ts      SSH wait/exec/read/write via guest IP
│   │   │   └── proxy/
│   │   │       ├── domain-match.ts  Domain allowlist matching (wildcard)
│   │   │       ├── ca.ts            Per-session ECDSA CA generation
│   │   │       └── server.ts        TLS MITM proxy (Bun.serve)
│   │   └── vitest.config.ts
│   ├── gateway/            Gateway service (Deployment)
│   └── snapshot-builder/   Snapshot build jobs
│
├── providers/
│   ├── core/               @paws/providers                   HostProvider interface + registry
│   ├── hetzner-dedicated/  @paws/provider-hetzner-dedicated  Hetzner Robot API (bare metal)
│   └── hetzner-cloud/      (v0.3+) Hetzner Cloud API + cloud-init
│
├── infra/
│   ├── pulumi/             Cluster provisioning (Pulumi TypeScript)
│   │   ├── index.ts            Main program — wires everything together
│   │   ├── Pulumi.yaml         Project metadata
│   │   ├── Pulumi.dev.yaml     Dev stack config (cx31, 1 worker, fsn1)
│   │   └── src/
│   │       ├── network.ts      VPC, private network, cluster firewall
│   │       ├── control-plane.ts  Gateway / K8s control-plane server
│   │       ├── worker.ts       Worker node servers + Firecracker install
│   │       └── k8s.ts          kubeadm init/join + kubectl apply (dynamic resources)
│   └── k8s/                K8s manifests (applied by Pulumi or kubectl directly)
│
├── scripts/
│   ├── bootstrap-node.sh
│   └── install-firecracker.sh
│
├── .dockerignore              Shared Docker ignore rules
├── docker-compose.yml         Local development (gateway + worker)
│
└── docs/
```

## Docker / Container Deployment

Both services ship as multi-stage Docker images built from the monorepo root context.

### Gateway (`apps/gateway/Dockerfile`)

- Base: `oven/bun:1.3.9-alpine`
- Runs as non-root user `paws`
- Port: `4000`
- No special capabilities required
- Key env vars: `PORT`, `API_KEY`, `WORKER_URL`

### Worker (`apps/worker/Dockerfile`)

- Builder stage: `oven/bun:1.3.9-alpine`
- Runner stage: `debian:bookworm-slim` (alpine avoided due to iptables-nft/legacy incompatibility)
- Runs as root (required for TAP devices, iptables DNAT, KVM access)
- Port: `3000`
- Requires: `--privileged` (or `CAP_NET_ADMIN` + `CAP_SYS_ADMIN`) + `/dev/kvm` device
- The `firecracker` binary must be mounted at `/usr/local/bin/firecracker`
- Key env vars: `PORT`, `MAX_CONCURRENT_VMS`, `MAX_QUEUE_SIZE`, `SNAPSHOT_DIR`, `VM_BASE_DIR`, `SSH_KEY_PATH`, `WORKER_NAME`
- Required volumes: snapshots dir (ro), VMs scratch dir (rw), SSH key dir (ro), firecracker binary (ro)

### Local development

```bash
docker compose up
```

The `docker-compose.yml` at the repo root starts both services. The gateway waits for the worker to
pass its health check before starting. All worker paths (snapshots, VMs, SSH key, firecracker
binary) are configurable via environment variables with sensible defaults pointing to
`/var/lib/paws/...`.

## Kubernetes Deployment (`infra/k8s/`)

Manifests for deploying paws on Kubernetes (v0.2+). Apply with:

```bash
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/rbac/
kubectl apply -f infra/k8s/gateway/
kubectl apply -f infra/k8s/worker/
```

### Structure

```
infra/k8s/
├── namespace.yaml          paws namespace
├── rbac/
│   ├── serviceaccount.yaml paws ServiceAccount (shared by gateway and worker)
│   └── clusterrole.yaml    ClusterRole + ClusterRoleBinding (gateway pod/endpoint discovery)
├── gateway/
│   ├── configmap.yaml      Non-secret env config (PORT, NODE_ENV)
│   ├── service.yaml        ClusterIP service on port 4000
│   └── deployment.yaml     Deployment — replicas: 1, non-root, no special capabilities
└── worker/
    ├── configmap.yaml      Non-secret env config (PORT, paths, concurrency limits)
    ├── service.yaml        ClusterIP service on port 3000
    └── daemonset.yaml      DaemonSet — one pod per node, privileged, hostNetwork
```

### Gateway Deployment

- `replicas: 1` for v0.1 (stateless, safe to scale)
- Runs as non-root (UID 1000)
- No special Linux capabilities required
- RBAC: reads `pods` and `endpoints` to discover worker nodes for routing
- `API_KEY` sourced from Secret `paws-gateway-secret` (must be created before deploy):
  ```bash
  kubectl create secret generic paws-gateway-secret \
    --from-literal=api-key=<value> -n paws
  ```
- Connects to workers via `http://worker.paws.svc.cluster.local:3000`

### Worker DaemonSet

- One pod per node — each worker manages that node's Firecracker VMs
- `hostNetwork: true` — required for TAP device and iptables rule visibility across host and container
- `hostPID: true` — required to interact with Firecracker processes on the host
- `privileged: true` — required for `ip tuntap`, `iptables DNAT`, and `/dev/kvm`
- Tolerates all taints so it runs on control-plane nodes too
- `WORKER_NAME` set via Downward API to the Kubernetes node name (unique per node)
- `terminationGracePeriodSeconds: 300` — allows in-flight VMs to complete or clean up
- hostPath volumes:
  | Volume | Host path | Mount | Mode |
  |---|---|---|---|
  | snapshots | `/var/lib/paws/snapshots` | `/var/lib/paws/snapshots` | ro |
  | vms | `/var/lib/paws/vms` | `/var/lib/paws/vms` | rw |
  | ssh | `/var/lib/paws/ssh` | `/var/lib/paws/ssh` | ro |
  | firecracker-bin | `/usr/local/bin/firecracker` | `/usr/local/bin/firecracker` | ro |
  | dev-kvm | `/dev/kvm` | `/dev/kvm` | rw |

### Resource Limits (Ryzen 5 3600 / 64 GB)

| Component | CPU request | CPU limit | Memory request | Memory limit |
| --------- | ----------- | --------- | -------------- | ------------ |
| Gateway   | 100m        | 500m      | 128Mi          | 512Mi        |
| Worker    | 500m        | 4         | 512Mi          | 8Gi          |

Worker limits are intentionally generous — it spawns KVM-backed VMs that consume host CPU/RAM
outside of cgroup accounting.

## Pulumi Provisioning (`infra/pulumi/`)

One-command cluster provisioning using Pulumi TypeScript + `@pulumi/hcloud`.

### What `pulumi up` does

```
1. Create SSH key resource on Hetzner Cloud
2. Create private network (10.0.0.0/8) + cluster firewall
3. Provision control-plane server (cx31, Ubuntu 24.04)
   → cloud-init: containerd + kubeadm (no kubeadm init yet)
4. Provision N worker servers (Hetzner Cloud for dev/staging only — no /dev/kvm)
   → cloud-init: containerd + kubeadm (Firecracker requires bare metal or nested virt)
5. SSH into control-plane → kubeadm init → Flannel CNI
6. SSH into each worker → kubeadm join
7. kubectl apply all infra/k8s/ manifests in order
```

### Stack config

| Key                      | Default             | Description                                                                                    |
| ------------------------ | ------------------- | ---------------------------------------------------------------------------------------------- |
| `paws:workerCount`       | `1`                 | Number of worker nodes                                                                         |
| `paws:gatewayServerType` | `cx31`              | Hetzner Cloud server type for gateway                                                          |
| `paws:workerServerType`  | `cx31`              | Hetzner Cloud server type for workers (dev/staging only — no /dev/kvm, cannot run Firecracker) |
| `paws:location`          | `fsn1`              | Hetzner datacenter location                                                                    |
| `paws:sshPublicKey`      | (required)          | SSH public key for node access                                                                 |
| `paws:sshPrivateKeyPath` | `~/.ssh/id_ed25519` | Private key path on the machine running pulumi                                                 |
| `hcloud:token`           | (required, secret)  | Hetzner Cloud API token                                                                        |

### Quick start

```bash
cd infra/pulumi
bun install
pulumi stack init dev
pulumi config set --secret hcloud:token <YOUR_TOKEN>
pulumi config set paws:sshPublicKey "$(cat ~/.ssh/id_ed25519.pub)"
pulumi up

# Save kubeconfig
pulumi stack output --show-secrets kubeconfig > ~/.kube/paws.yaml
export KUBECONFIG=~/.kube/paws.yaml
kubectl get nodes
```

### Notes on dedicated servers

There is no official Pulumi provider for Hetzner Robot (dedicated server API). For
production bare-metal worker nodes (AX41), provision them via the Hetzner Robot web UI or
`providers/hetzner-dedicated`, then join them to the cluster manually with `kubeadm join`.
The Pulumi program handles the Hetzner Cloud case for the control plane. Hetzner Cloud VMs
lack `/dev/kvm` and cannot run Firecracker workers. Production workers require bare metal
(Hetzner Dedicated, e.g. AX41) or AWS EC2 instances with nested virtualization (C8i family).
