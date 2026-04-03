# paws — Secure infrastructure for AI agents

Zero-trust credential injection for AI agents. Secrets never enter the sandbox — they're injected at
the network layer by a per-VM TLS MITM proxy. Agents run in ephemeral Firecracker microVMs with
nothing worth stealing.

## Before You Start

Before beginning any implementation work, orient yourself:

1. **Check open PRs** — use GitHub tools to list open PRs on `arek-e/paws`. Understand what's
   currently in-flight so you don't duplicate or conflict with ongoing work.
2. **Check recently merged PRs** — review the last 5-10 merged PRs to understand what's already
   been built and the patterns established.
3. **Read the roadmap** — `@docs/roadmap.md` has the v0.1 task list with status indicators (⬜ not
   started, 🟡 in progress, ✅ done). Identify what's next.
4. **Read relevant docs** — before touching any area, read its doc:
   - New package/app → `@docs/architecture.md`
   - Security-related (proxy, credentials, networking) → `@docs/security.md`
   - Adding tests → `@docs/testing.md`
   - API routes → `@docs/api.md`
   - Server/infra work → `@docs/fc-staging-server.md`
5. **Check existing code** — if packages or apps already exist, read their structure before adding
   to them. Don't reinvent what's already there.

Do this research using sub-agents to keep your main context clean. Summarize findings briefly before
proposing work.

## Task Workflow

### Picking work

- `docs/roadmap.md` is the **single source of truth** for what needs doing.
- Pick any `⬜` (not started) item — tasks can be parallelized across agents when they're
  independent (e.g. `packages/types` and `packages/firecracker` can run in parallel).
- Never pick a `🟡` (in progress) item — another agent is on it. Check open PRs to confirm.
- If your task depends on another (`apps/worker` needs `packages/firecracker`), verify the
  dependency is merged or at least PR-ready before building on it.

### Before coding

- Update `docs/roadmap.md`: mark your task `🟡` (in progress) and commit that change first.
- Write a brief implementation plan: what files you'll create, key patterns, decisions. This goes in
  your PR description.

### While coding

- One roadmap item per PR. Keep scope focused.
- Follow existing patterns — check merged PRs and existing code for conventions.
- When adding a new package or app, update `docs/architecture.md` with its role and structure.

### When done

- Update `docs/roadmap.md`: mark your task `✅` (done).
- Create a PR with a description covering:
  - **What was built** — files created, key abstractions
  - **Decisions made** — why you chose an approach, alternatives considered
  - **Deferred work** — anything intentionally left out, noted for future
- Tests must pass (`bun test` at minimum, `bun run check` if possible).

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
bun run start            # start control-plane + worker
```

## Architecture

Read before making changes: @docs/architecture.md, @docs/security.md

- Control plane (`apps/control-plane/`) receives requests, holds all credentials, proxies LLM calls
- Worker (execution node) manages Firecracker VMs, each with its own TLS MITM proxy
- Zero secrets enter the VM — credentials injected at network layer by per-VM proxy
- Daemons are ephemeral — each trigger spins up a fresh VM, state persists via control plane DB +
  mounted volumes
- Workers connect via K8s Services (in-cluster) or WebSocket call-home (remote). Control plane
  discovers workers via K8s pod watcher (primary) or static URL (dev).

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
- Commit prefix with scope: `firecracker: add snapshot restore`, `control-plane: add sessions`
- Each commit independently valid (bisect-friendly)

## Gotchas

- **`@types/bun` at root, not per-package.** All TypeScript types come from the root `@types/bun`
  devDependency. Every package's `tsconfig.json` extends `packages/typescript-config/library.json`
  (or `app-bun.json` / `app-react.json`), which extends `base.json`. Never add `bun-types`,
  `@types/bun`, or `@types/node` to individual packages. Never set `"types": [...]` in per-package
  tsconfigs, as it overrides auto-detection and breaks type resolution.
- **Bun's `fetch` has extra methods.** `typeof globalThis.fetch` under Bun includes `preconnect`,
  which vitest mocks don't have. In tests, use `fn as unknown as typeof globalThis.fetch` to cast
  mock functions to the fetch type. Don't use `as any`.
- **Dockerfiles use `COPY . .` with `.dockerignore`.** New packages are picked up automatically.
  If you add files that shouldn't be in the Docker image (large assets, secrets, dev tools),
  add them to `.dockerignore`.
- **Turbo daemon hangs on GH runners.** Always set `TURBO_NO_DAEMON=1` in CI workflows.
- **Vitest polyfill rejects `new Response('', {status: 204})`.** Use `new Response(null, {status: 204})`
  in test mocks for HTTP 204 responses.

## Current Phase

v0.1 — single server, no K8s. See @docs/roadmap.md

## Test Server

`ssh root@teampitch-fc-staging` (Tailscale). Ryzen 5 3600, 64GB RAM. See @docs/fc-staging-server.md

## Deploy Configuration (configured by /setup-deploy)

- Platform: Kubernetes on Hetzner (manual/Pulumi)
- Production URL: none (self-hosted, no public web UI yet)
- Deploy workflow: none (Argo CD + GH Actions tag-based deploy planned, not yet implemented)
- Deploy status command: none
- Merge method: squash
- Project type: infrastructure platform (not a web app)
- Post-deploy health check: none

### Custom deploy hooks

- Pre-merge: `bun test` (unit tests)
- Deploy trigger: manual (`pulumi up` from infra/pulumi/ or `kubectl apply` from infra/k8s/)
- Deploy status: SSH to teampitch-fc-staging, check `kubectl get pods`
- Health check: `curl http://100.78.44.23:4000/health` (gateway via Tailscale)
