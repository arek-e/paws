# paws

Self-hosted platform for running AI agents in isolated Firecracker microVMs with zero-trust
credential injection.

## Commands

```bash
bun install              # install deps
bun run build            # build all packages
bun test                 # tier 1: unit tests (anywhere)
bun test:integration     # tier 2: needs Linux/root
bun run test:vm:remote   # tier 3: needs Hetzner /dev/kvm
bun run lint             # oxlint across all packages
bun run format           # oxfmt format all files
bun run format:check     # oxfmt check (CI)
bun run typecheck        # type-check
bun run check            # lint + typecheck + format check
bun run knip             # find unused deps/exports
bun run start            # start gateway + worker
```

## Architecture

Read before making changes: @docs/architecture.md, @docs/security.md

- Gateway (control plane) receives requests, holds all credentials, proxies LLM calls
- Worker (execution node) manages Firecracker VMs, each with its own TLS MITM proxy
- Zero secrets enter the VM — credentials injected at network layer by per-VM proxy
- Daemons are ephemeral — each trigger spins up a fresh VM, state persists via gateway DB + mounted
  volumes

## Non-Negotiable Decisions

- NEVER pass API keys, tokens, or secrets into the VM. Only `SESSION_TOKEN` and `GATEWAY_URL`.
- One TLS proxy per VM. Never shared. Spawned with VM, killed with VM.
- Firecracker with memory snapshots for sub-second boot. No alternative runtimes.
- Spec-first API: routes defined with `@hono/zod-openapi`. OpenAPI spec generated from code.
- `neverthrow` (`ResultAsync`/`Result`) in `packages/` for operations that can fail. Apps use
  try/catch at HTTP boundaries.

## Stack

Bun, TypeScript strict, Hono, Zod, neverthrow, vitest (per-package configs), Turborepo, oxlint,
oxfmt, knip, syncpack.

## Testing

See @docs/testing.md for full strategy.

- Test-first for pure logic (types, scheduler, ip-pool, client, proxy domain matching, routes)
- Test-after for system plumbing (TAP, iptables, SSH, VM lifecycle)
- Colocated: `foo.test.ts` next to `foo.ts`, `foo.integration.test.ts` for integration
- Dependency injection for testability: firecracker client accepts injected `request`, shell
  wrappers accept injected `exec`
- Coverage enforced only on pure modules: types/scheduler/ip-pool (100%), client (90%)
- Proxy tests use local fake HTTPS servers — never hit real external services

## Conventions

- Factory functions over classes (`createFirecrackerClient()`, not `new FirecrackerClient()`)
- Typed errors: `DaemonsError` with error codes, not generic `Error`
- Zod for all external data (API requests, config, env via `@t3-oss/env-core`)
- Commit prefix with scope: `firecracker: add snapshot restore`, `gateway: add sessions`
- Each commit independently valid (bisect-friendly)

## Current Phase

v0.1 — single server, no K8s. See @docs/roadmap.md

## Test Server

`ssh root@teampitch-fc-staging` (Tailscale). Ryzen 5 3600, 64GB RAM. See @docs/fc-staging-server.md
