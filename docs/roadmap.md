# Roadmap

```
 /\_/\
( o.o )  the plan
 > ^ <
```

## v0.1 — Single Server, Core Loop

**Goal:** A working system on one Linux box. Submit workloads, run in isolated Firecracker VMs, zero
secrets in the sandbox.

| #   | Package/App            | What                                                                                                                                                         | Status |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | `packages/types`       | Shared Zod schemas (session, daemon, worker, fleet, snapshot, network)                                                                                       | ✅     |
| 2   | `packages/firecracker` | Firecracker VM lifecycle — client, create, restore, stop, list, snapshot, networking (TAP, ip-pool, iptables)                                                | ✅     |
| 3   | `apps/worker`          | Worker service — execute sessions, semaphore concurrency, health endpoint, per-VM TLS proxy, SSH into VM                                                     | ✅     |
| 4   | `apps/gateway`         | Gateway service — spec-first API (sessions, daemons, webhooks, fleet, snapshots), session tracking, daemon registry, trigger engine, governance, LLM history | ✅     |
| 5   | Scripts                | `install-firecracker.sh`, `bootstrap-node.sh`                                                                                                                | 🟡     |
| 6   | Testing                | Tier 1 unit tests (all pure logic modules), Tier 2 integration tests (proxy, TAP), Tier 3 VM test scaffold + test snapshot                                   | ✅     |

**v0.1 deliverable:** `bun run start` on a Hetzner server. Hit the API, workloads run in isolated
VMs, credentials never enter the sandbox.

**Testing in v0.1:** Test-first for types, scheduler, ip-pool, client, proxy logic, gateway routes.
Test-after for system plumbing. See [testing.md](testing.md).

**Not in v0.1:** Kubernetes, multi-node, Pulumi, providers, SDK generation, snapshot distribution.

---

## v0.2 — Kubernetes + Multi-Node

**Goal:** Deploy on Kubernetes. Add a second server and sessions route across both.

| #   | What                                                                 | Status |
| --- | -------------------------------------------------------------------- | ------ |
| 6   | `infra/k8s/` — namespace, worker DaemonSet, gateway Deployment, RBAC | ⬜     |
| 7   | `packages/scheduler` — least-loaded worker selection                 | ⬜     |
| 8   | Gateway: K8s service discovery (watch worker pods)                   | ⬜     |
| 9   | Worker + Gateway Dockerfiles                                         | ⬜     |
| 10  | kubeadm setup on Hetzner (replace K3s)                               | ⬜     |
| 11  | Add second Hetzner server as worker node                             | ⬜     |

**v0.2 deliverable:** `kubectl apply` deploys paws. Two worker nodes, gateway routes sessions to
least-loaded.

---

## v0.3 — Provider Plugins + Pulumi

**Goal:** One-command cluster provisioning. Pluggable host providers.

| #   | What                                                                         | Status |
| --- | ---------------------------------------------------------------------------- | ------ |
| 12  | `providers/core` — HostProvider interface + registry                         | ⬜     |
| 13  | `providers/hetzner-dedicated` — Hetzner Robot API                            | ⬜     |
| 14  | `providers/hetzner-cloud` — Hetzner Cloud API + cloud-init                   | ⬜     |
| 15  | `infra/pulumi/` — cluster provisioning program                               | ⬜     |
| 16  | Node bootstrap automation (install firecracker, join cluster, pull snapshot) | ⬜     |

**v0.3 deliverable:** `bun run pulumi up` provisions a full cluster from scratch.

---

## v0.4 — Snapshot Distribution

**Goal:** Build snapshots on-demand, distribute across nodes automatically.

| #   | What                                                                   | Status |
| --- | ---------------------------------------------------------------------- | ------ |
| 17  | `apps/snapshot-builder` — K8s Job, builds snapshot from YAML config    | ⬜     |
| 18  | Object storage integration (S3-compatible) — upload/download snapshots | ⬜     |
| 19  | Worker sync loop — check manifest version, pull if stale, atomic swap  | ⬜     |
| 20  | `POST /v1/snapshots/:id/build` triggers distributed rebuild            | ⬜     |

---

## v0.5 — SDK + DX

**Goal:** First-class developer experience. SDKs in multiple languages.

| #   | What                                                                       | Status |
| --- | -------------------------------------------------------------------------- | ------ |
| 21  | OpenAPI spec export from gateway (`@hono/zod-openapi`)                     | ⬜     |
| 22  | SDK generation pipeline (openapi-generator)                                | ⬜     |
| 23  | `@paws/sdk` — TypeScript client (hand-tuned wrapper around generated code) | ⬜     |
| 24  | Python SDK                                                                 | ⬜     |
| 25  | CLI tool (`paws sessions create`, `paws daemons list`, etc.)               | ⬜     |

---

## v1.0 — Production Ready

| #   | What                                                                 | Status |
| --- | -------------------------------------------------------------------- | ------ |
| 26  | Auto-scaling — provision/drain nodes based on fleet utilization      | ⬜     |
| 27  | Daemon state sync — object storage for cross-node volume portability | ⬜     |
| 28  | WebSocket streaming — real-time session output                       | ⬜     |
| 29  | Prometheus metrics export                                            | ⬜     |
| 30  | Dashboard UI — fleet status, daemon activity, session history        | ⬜     |
| 31  | Multi-snapshot support — different base images per workload type     | ⬜     |
| 32  | Cost tracking — per-daemon resource usage                            | ⬜     |
| 33  | Comprehensive test suite                                             | ⬜     |
| 34  | Security audit                                                       | ⬜     |

---

## Design Principles (carry through all versions)

1. **Zero secrets in the VM** — never compromise on this
2. **Sub-second boot** — Firecracker snapshots, always
3. **Spec-first API** — OpenAPI spec generated from code, SDKs follow
4. **Provider-agnostic** — core never imports provider-specific code
5. **Cat-themed** — ASCII cats in CLI output, cat puns in docs, good vibes
