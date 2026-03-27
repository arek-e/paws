# Architecture

```
 /\_/\
( o.o )  paws architecture
 > ^ <
```

## Overview

paws is a self-hosted platform for running background AI agents in Firecracker microVMs. It consists
of two core services — a **gateway** (control plane) and **workers** (execution nodes) — connected
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
├── providers/              (v0.2+)
│   ├── core/               HostProvider interface
│   ├── hetzner-dedicated/  Pulumi: Hetzner Robot API
│   └── hetzner-cloud/      Pulumi: Hetzner Cloud API
│
├── infra/                  (v0.2+)
│   ├── pulumi/             Cluster provisioning
│   └── k8s/                Manifests
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
