---
title: Architecture
description: How paws coordinates control plane, workers, and ephemeral VMs to run agents with zero secrets.
---

paws (**P**rotected **A**gent **W**orkspace **S**andboxes) runs AI agents in ephemeral Firecracker microVMs. Credentials never enter the VM -- they're injected at the network layer by a per-VM TLS proxy.

## Two services

paws has two core services:

**Control plane** (`apps/control-plane/`) -- the brain. Receives API requests, stores daemon configs, tracks sessions, holds all credentials, and routes work to workers. Runs on any VPS.

**Worker** (`apps/worker/`) -- the muscle. Manages Firecracker VMs on bare metal. Each worker runs on a Linux host with `/dev/kvm`. Workers connect to the control plane via K8s Services (in-cluster) or WebSocket call-home (remote).

```
Control Plane (K8s Deployment)   Worker (bare metal, DaemonSet)
├── API + dashboard              ├── Worker process
├── Daemon registry              ├── Firecracker VMs
├── Session tracker              │   ├── VM 1 + Proxy 1
├── Scheduler                    │   ├── VM 2 + Proxy 2
└── Dex (OIDC SSO)               │   └── VM N + Proxy N
                                  └── WebSocket call-home (remote)
    Connected via: K8s Service / WebSocket
```

## Two execution models

### Sessions (one-shot)

Submit a workload, get a result, VM destroyed.

1. You POST to `/v1/sessions` with a script or agent config
2. Scheduler picks the least-loaded worker
3. Worker restores a VM from snapshot (under 1 second)
4. Worker spawns an isolated TLS proxy for this VM
5. iptables routes all VM traffic through the proxy
6. Script runs, result collected
7. VM and proxy destroyed

### Daemons (persistent roles)

A daemon is a definition, not a running process. It describes what to run and when to trigger it. When a trigger fires (webhook, cron, or watch condition), the control plane creates a session for it.

Daemons accumulate context across invocations through two mechanisms:

- **LLM history** -- the control plane stores conversation context (it sees all LLM calls because it's on the proxy path)
- **State volume** -- a `/state` directory persists across invocations on the worker node

The VM itself is always ephemeral.

## VM lifecycle

Each session follows these steps:

1. Allocate network -- TAP device + /30 subnet
2. Spawn TLS proxy -- bound to host-side IP, loaded with session credentials
3. iptables rules -- DNAT ports 80/443 to proxy, DROP everything else
4. Restore VM -- copy-on-write disk, load memory snapshot, resume
5. Wait for SSH -- poll guest at 172.16.x.2:22
6. Write workload -- SSH into VM, write script + env vars
7. Execute -- run with timeout
8. Collect result -- read stdout/stderr + `/output/result.json`
9. Stop VM -- kill Firecracker process
10. Kill proxy -- kill proxy process
11. Teardown network -- remove iptables rules, destroy TAP device

Steps 9-11 always run, even on failure.

## Snapshot boot

Each snapshot contains a kernel, root filesystem, full memory state, and CPU register state. On restore, the disk is copied with CoW (`cp --reflink=auto`), Firecracker loads the memory and vmstate, and the VM resumes exactly where it was paused.

Boot time: under 1 second (28ms with userfaultfd lazy loading).

## Worker discovery

The control plane discovers workers through three layers (first match wins):

1. **K8s pod watcher** -- in-cluster pod discovery (primary)
2. **WebSocket call-home** -- remote workers register via WebSocket
3. **Static URL** -- manual `WORKER_URL` env var for development

## Scheduling

The scheduler is a pure function: given a list of workers with their capacity, it picks the one with the most available slots. If no worker has capacity, the session queues.

## Network isolation

Each VM gets its own TAP device, its own /30 subnet, and its own iptables rules. The VM cannot reach the internet directly, cannot reach other VMs, and cannot reach host services. All traffic routes through the per-VM proxy, which enforces the domain allowlist.

See [Security](/concepts/security/) for the full model.
