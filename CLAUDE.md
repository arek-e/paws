# paws — Secure infrastructure for AI agents

IMPORTANT: Secrets stay out of the VM. Credentials are injected at the network layer by a per-VM
TLS MITM proxy. Every rule below serves this principle.

## Non-Negotiable Rules

- All secrets injected by per-VM proxy. Only `SESSION_TOKEN` and `GATEWAY_URL` enter the VM.
- One TLS proxy per VM. Spawned with VM, killed with VM. Never shared.
- Firecracker with memory snapshots for sub-second boot. No alternative runtimes.
- Spec-first API: routes defined with `@hono/zod-openapi`. OpenAPI spec generated from code.
- `neverthrow` (`ResultAsync`/`Result`) in `packages/` for failable operations. Apps use try/catch
  at HTTP boundaries.

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

## Stack

Bun, TypeScript strict, Hono, Zod, neverthrow, vitest (per-package configs), Turborepo, oxlint,
oxfmt, knip, syncpack.

## Architecture

Details: @docs/architecture.md, @docs/security.md

- Control plane (`apps/control-plane/`) — receives requests, holds credentials, proxies LLM calls
- Worker (`apps/worker/`) — manages Firecracker VMs, each with its own TLS MITM proxy
- Daemons are ephemeral — fresh VM per trigger, state persists via control plane DB + volumes

## Conventions

- Factory functions over classes: `createFirecrackerClient()`, not `new FirecrackerClient()`
- Typed errors: `DaemonsError` with error codes, not generic `Error`
- Zod for all external data (API requests, config, env via `@t3-oss/env-core`)
- Commit prefix with scope: `firecracker: add snapshot restore`, `control-plane: add sessions`
- Each commit independently valid (bisect-friendly)
- **Bun workspace catalog for dependency versions.** Shared deps defined once in root `package.json`
  under `workspaces.catalog`. Packages use `"zod": "catalog:"`. To add or bump a shared dep: edit
  the catalog in root `package.json`, then `bun install`. Never pin versions directly in workspace
  packages for deps in the catalog.
- Type everything explicitly. Use type guards, narrowing, conditional spreads, or narrower type
  definitions instead of `as any` or `as unknown`. In tests, define explicit helper types (e.g.,
  `type FetchFn`) rather than casting mocks.

## Testing

Full strategy: @docs/testing.md

- Test-first for pure logic, test-after for system plumbing
- Colocated: `foo.test.ts` next to `foo.ts`, `foo.integration.test.ts` for integration
- Dependency injection for testability (inject `request`, `exec`)
- Proxy tests use local fake HTTPS servers — never hit real external services

## Gotchas

- **`@types/bun` at root, not per-package.** Every package's tsconfig extends
  `packages/typescript-config/`. Never add `bun-types`, `@types/bun`, or `@types/node` to
  individual packages. Never set `"types": [...]` in per-package tsconfigs.
- **Bun's `fetch` has extra methods.** In tests, use `fn as unknown as typeof globalThis.fetch` to
  cast mock functions to the fetch type.
- **Dockerfiles use `COPY . .` with `.dockerignore`.** Add large assets, secrets, dev tools to
  `.dockerignore`.
- **Turbo daemon hangs on GH runners.** Set `TURBO_NO_DAEMON=1` in CI workflows.
- **Vitest polyfill rejects `new Response('', {status: 204})`.** Use `new Response(null, {status: 204})`.

## Agent Roles

Give each sub-agent a clear, narrow role:

- **Research agent** — reads docs, checks PRs, searches code. Reports findings. No edits.
- **Implementation agent** — codes one roadmap item. Works in a worktree. Creates a PR.
- **Review agent** — runs `bun run check`, reads diffs, checks conventions. No edits.

## Parallel Work & Worktrees

Use `isolation: "worktree"` for every implementation sub-agent. Without this, agents overwrite
each other's files.

- One agent = one worktree = one branch. Two agents in the same worktree is a bug.
- Agents commit their work before finishing. Uncommitted changes are lost on cleanup.
- Avoid shared file conflicts: if two agents both need `docs/roadmap.md` or root `package.json`,
  sequence them or assign one owner.
- Run `git worktree prune` after parallel work. Each worktree duplicates `node_modules`.
- Research agents skip worktrees — they don't edit files.

## Current Phase

v0.1 — single server, no K8s. See @docs/roadmap.md

---

IMPORTANT: Secrets stay out of the VM. If you're about to pass a key, token, or credential into a
VM — stop. Inject it at the proxy layer instead.
