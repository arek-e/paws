# Contributing to paws

```
 /\_/\
( o.o )  welcome
 > ^ <
```

## Setup

```bash
# Clone
git clone https://github.com/arek-e/paws
cd paws

# Install dependencies (requires Bun)
bun install

# Run tests
bun test

# Full CI check (lint + typecheck + format)
bun run check
```

## Project Structure

```
apps/
  control-plane/   # API server, dashboard serving, session dispatch
  dashboard/       # React SPA (fleet overview, sessions, setup wizard)
  worker/          # Firecracker VM executor, per-VM TLS proxy

packages/
  types/           # Shared Zod schemas
  credentials/     # AES-256-GCM credential encryption
  provisioner/     # Server provisioning state machine
  scheduler/       # Least-loaded worker selection
  firecracker/     # VM lifecycle (create, restore, stop, networking)
  proxy/           # TLS MITM proxy for credential injection
  snapshot-store/  # R2 snapshot distribution
  sdk/             # TypeScript client
  cli/             # CLI tool

providers/
  aws-ec2/             # AWS EC2 host provider
  hetzner-cloud/       # Hetzner Cloud host provider
  hetzner-dedicated/   # Hetzner Robot API (bare metal)
```

## Commands

```bash
bun install          # install deps
bun test             # unit tests (runs anywhere)
bun run typecheck    # type-check all packages
bun run lint         # oxlint
bun run format       # oxfmt auto-format
bun run check        # lint + typecheck + format (CI gate)
```

## Conventions

- **Factory functions** over classes: `createProvisioner()`, not `new Provisioner()`
- **neverthrow** in packages: `ResultAsync` / `Result` for fallible operations
- **Zod** for all external data validation
- **Colocated tests**: `foo.test.ts` next to `foo.ts`
- **Commit prefixes**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- **One logical change per commit** (bisect-friendly)

## Pull Requests

1. Branch from `main`
2. Make your changes
3. Run `bun run check` (must pass)
4. Run `bun test` (must pass)
5. Open a PR with a clear description of what and why

## Testing

- Test-first for pure logic (types, scheduler, credentials, provisioner)
- Test-after for system plumbing (TAP devices, iptables, SSH)
- Tests colocated: `foo.test.ts` next to `foo.ts`
- Integration tests: `foo.integration.test.ts`
- See `docs/testing.md` for the full strategy

## Architecture

Read `docs/architecture.md` before making changes. The core principle:

> Zero secrets in the VM. Credentials are injected at the network layer by a per-VM TLS MITM proxy. The VM has nothing worth stealing.

## Questions?

Open an issue. We're friendly.
