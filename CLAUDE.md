# paws

```
  /\_/\
 ( o.o )  paws — background agents at your service
  > ^ <
```

Self-hosted platform for running AI agents in isolated Firecracker microVMs with zero-trust credential injection.

## Quick Reference

```bash
bun install                    # Install dependencies
bun run build                  # Build all packages
bun test                       # Tier 1: unit tests (runs anywhere)
bun test:integration           # Tier 2: needs Linux/root
bun run test:vm:remote         # Tier 3: needs Hetzner server with /dev/kvm
bun run start                  # Start gateway + worker locally
bun run lint                   # Lint all packages
bun run typecheck              # Type-check all packages
```

## Architecture

Read these docs before making changes:

- [docs/architecture.md](docs/architecture.md) — full system design (gateway + worker + per-VM proxy)
- [docs/security.md](docs/security.md) — zero-trust model, MITM proxy, network isolation
- [docs/api.md](docs/api.md) — gateway API reference (spec-first, OpenAPI)
- [docs/testing.md](docs/testing.md) — three-tier test strategy, TDD rules
- [docs/roadmap.md](docs/roadmap.md) — phased implementation plan

## Key Architectural Decisions

These are non-negotiable unless explicitly discussed:

1. **Zero secrets in the VM** — credentials are injected at the network layer by a per-VM TLS MITM proxy on the host. The VM only receives `SESSION_TOKEN` and `GATEWAY_URL`. Never pass API keys, tokens, or secrets into the VM.

2. **Per-VM proxy isolation** — each VM gets its own proxy process. Proxies are never shared across VMs. Spawned with the VM, killed with the VM.

3. **Ephemeral daemons** — daemons are definitions, not persistent VMs. Each trigger spins up a fresh VM. State persists via gateway DB (LLM history) and mounted volumes (files/repos).

4. **Spec-first API** — gateway routes defined with `@hono/zod-openapi`. The OpenAPI spec is generated from code, never hand-written. SDKs are generated from the spec.

5. **Firecracker with snapshots** — sub-second boot from memory snapshots. This is the core performance guarantee.

6. **neverthrow for error handling** — use `ResultAsync` / `Result` in `packages/firecracker` and system-level code. Apps (gateway, worker) can use try/catch at HTTP boundaries.

## Monorepo Structure

```
paws/
├── packages/
│   ├── types/              @paws/types        Shared Zod schemas
│   ├── firecracker/        @paws/firecracker  VM lifecycle library
│   └── scheduler/          @paws/scheduler    Fleet scheduling
│
├── apps/
│   ├── worker/             Worker service (manages VMs on a node)
│   ├── gateway/            Gateway service (public API, control plane)
│   └── snapshot-builder/   Snapshot build jobs
│
├── providers/              (v0.2+) Host provider plugins
│   ├── core/               HostProvider interface
│   ├── hetzner-dedicated/
│   └── hetzner-cloud/
│
├── infra/                  (v0.2+) K8s manifests + Pulumi
├── scripts/                Bootstrap and install scripts
└── docs/                   Architecture, security, API, testing, roadmap
```

## Technology Stack

| What | Tool |
|---|---|
| Runtime | Bun |
| Language | TypeScript (strict) |
| HTTP | Hono + @hono/zod-openapi |
| Validation | Zod |
| Error handling | neverthrow (ResultAsync) |
| Testing | vitest (per-package configs) |
| Build | Turborepo |
| VM runtime | Firecracker (KVM) |
| API spec | OpenAPI 3.1 (generated from code) |

## Testing Rules

See [docs/testing.md](docs/testing.md) for the full strategy.

- **Test-first** for pure logic: types, scheduler, ip-pool, firecracker client, proxy domain matching, gateway routes
- **Test-after** for system plumbing: TAP devices, iptables, SSH, VM lifecycle
- **Colocated test files**: `foo.test.ts` next to `foo.ts`, `foo.integration.test.ts` for integration tests
- **Per-package vitest configs**: `vitest.config.ts` (unit) and `vitest.integration.config.ts` (integration)
- **Dependency injection** for testability: firecracker client accepts injected `request` function, shell wrappers accept injected `exec`
- **Local fake servers** for proxy tests — never hit real external services
- **Coverage enforced** only on pure modules: types (100%), scheduler (100%), ip-pool (100%), client (90%)

## Coding Conventions

- **TypeScript strict mode** — no `any`, no implicit returns
- **Zod for all external data** — API requests, config, env vars (`@t3-oss/env-core`)
- **Hono for HTTP** — both gateway and worker
- **neverthrow in packages/** — `Result` and `ResultAsync` for operations that can fail
- **No classes unless necessary** — prefer factory functions (`createFirecrackerClient()`, `createFirecrackerService()`)
- **Errors are typed** — `DaemonsError` with error codes, not generic `Error`
- **No secrets in code or tests** — use `test-key`, `sk-test-123` etc. in tests

## Commit Style

- Short, descriptive messages focused on "why" not "what"
- Prefix with scope when touching a specific package: `firecracker: add snapshot restore`, `gateway: add session tracking`
- Each commit should be independently valid (bisect-friendly)

## Current Phase

See [docs/roadmap.md](docs/roadmap.md). We're building **v0.1** — single server, no K8s.

## Test Server

The Hetzner dedicated server `teampitch-fc-staging` is the test bed:
- SSH: `ssh root@teampitch-fc-staging` (via Tailscale)
- Specs: Ryzen 5 3600, 64GB RAM, 2x NVMe RAID 1
- See [docs/fc-staging-server.md](docs/fc-staging-server.md)
