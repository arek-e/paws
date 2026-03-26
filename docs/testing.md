# Testing Strategy

```
  /\_/\
 ( o.o )  trust, but verify
  > ^ <
```

## Overview

Three tiers of tests, separated by infrastructure requirements. Each tier runs independently via Turborepo pipelines.

| Tier | What | Needs | Runs where | Pipeline |
|---|---|---|---|---|
| **Tier 1: Unit** | Pure logic, mocked dependencies | Nothing — runs anywhere | CI + local | `bun test` |
| **Tier 2: Integration** | Real system calls, real TLS | Linux, may need root | CI (Linux runner) + Hetzner | `bun test:integration` |
| **Tier 3: VM** | Full Firecracker VM lifecycle | `/dev/kvm`, root, snapshot | Hetzner server only | `bun test:vm` |

## Test-First vs Test-After

| Module | Approach | Why |
|---|---|---|
| `packages/types` | Test-first | Pure validation |
| `packages/scheduler` | Test-first | Pure functions |
| `packages/firecracker` — ip-pool | Test-first | Pure math |
| `packages/firecracker` — client | Test-first | Mock injected request function |
| `apps/worker` — proxy logic (domain matching, header injection) | Test-first | Pure logic, security-critical |
| `apps/gateway` — route handlers | Test-first | Request/response contracts |
| `apps/gateway` — trigger engine | Test-first | Cron parsing, webhook validation |
| `packages/firecracker` — tap/iptables | Test-after | Shell command wrappers |
| `packages/firecracker` — restore | Test-after | Complex orchestration |
| `apps/worker` — proxy TLS | Test-after | Real TLS interception |
| `apps/worker` — SSH | Test-after | Needs real VM |
| `apps/worker` — executor | Test-after | Full VM lifecycle |

## Runner and Config

**vitest** with per-package configs. Each package has:

```
packages/firecracker/
├── vitest.config.ts              # Tier 1 unit tests
├── vitest.integration.config.ts  # Tier 2 integration tests
└── src/
    ├── network/
    │   ├── ip-pool.ts
    │   ├── ip-pool.test.ts                # Tier 1
    │   ├── tap.ts
    │   ├── tap.test.ts                    # Tier 1 (mocked exec)
    │   └── tap.integration.test.ts        # Tier 2 (real TAP devices)
    └── vm/
        ├── restore.ts
        └── restore.integration.test.ts    # Tier 3 (real Firecracker)
```

**File naming:**
- `*.test.ts` — unit tests (Tier 1)
- `*.integration.test.ts` — integration tests (Tier 2 or 3)

**Turbo pipelines:**
```json
{
  "test": {},
  "test:integration": {},
  "test:vm": {}
}
```

## Coverage

Enforced only on pure logic modules:

| Module | Threshold |
|---|---|
| `packages/types` | 100% |
| `packages/scheduler` | 100% |
| `packages/firecracker` — ip-pool | 100% |
| `packages/firecracker` — client | 90% |
| Everything else | Tracked, not enforced |

## Mocking Strategy

### Firecracker client — dependency injection

The client accepts an optional `request` function. Production uses real `http.request` over Unix socket. Tests inject a fake.

```typescript
// Production
const client = createFirecrackerClient(socketPath)

// Test
const client = createFirecrackerClient(socketPath, {
  request: async (method, path, body) => {
    // Return canned response
    return { statusCode: 200, body: '{}' }
  }
})
```

Same pattern for shell commands in tap/iptables — inject `exec` to verify args without running real commands.

```typescript
// Production
createTap(alloc)

// Test
createTap(alloc, {
  exec: async (cmd, args) => {
    // Verify: cmd === 'ip', args === ['tuntap', 'add', ...]
    return { stdout: '', stderr: '' }
  }
})
```

### Gateway routes — Hono test client

Unit tests use Hono's built-in `app.request()` — no server, no port:

```typescript
test('POST /v1/sessions returns 202', async () => {
  const res = await app.request('/v1/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test-key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snapshot: 'test',
      workload: { type: 'script', script: 'echo hi' },
    }),
  })
  expect(res.status).toBe(202)
  expect(await res.json()).toHaveProperty('sessionId')
})
```

One integration test file per app boots the real server on a random port and hits every endpoint over HTTP to catch wiring issues.

### TLS proxy — local fake servers

Proxy tests never hit real external services. A local HTTPS server stands in:

```typescript
// Test setup
const fakeServer = createFakeHttpsServer({ port: 9999 })
const proxy = createProxy({
  listenPort: 8443,
  allowlist: {
    'api.anthropic.com': {
      target: 'https://localhost:9999',
      headers: { 'x-api-key': 'sk-test-123' },
    },
  },
})

// Test: credential injection
test('injects x-api-key header for anthropic', async () => {
  const res = await curlThroughProxy('https://api.anthropic.com/v1/messages')
  expect(fakeServer.lastRequest.headers['x-api-key']).toBe('sk-test-123')
})

// Test: domain blocking
test('blocks non-allowlisted domains', async () => {
  const res = await curlThroughProxy('https://evil.com')
  expect(res.error).toBe('connection_refused')
})
```

## Running VM Tests (Tier 3)

VM tests run on the Hetzner server via a remote script:

```bash
# From your laptop
bun run test:vm:remote

# What it does:
# 1. rsync code to teampitch-fc-staging
# 2. ssh root@teampitch-fc-staging "cd /tmp/paws && bun test:vm"
# 3. Stream output back
```

### Test snapshot

VM tests use a minimal cached snapshot at `/var/lib/paws/snapshots/test-minimal/`. Tiny Ubuntu image (~500 MB disk) that can respond to SSH and run basic commands. No agent tools installed.

```bash
# Build test snapshot (first time, or to rebuild)
bun run test:vm:remote --rebuild-snapshot

# Run VM tests (uses cached snapshot)
bun run test:vm:remote
```

The snapshot is built once and cached. Rebuild with `--rebuild-snapshot` flag.

### What VM tests verify

- VM restore from snapshot boots in <1 second
- SSH connection succeeds
- Script execution inside VM returns stdout/stderr
- `/output/result.json` can be read back
- VM stop + cleanup (TAP device removed, iptables rules cleaned, process killed)
- Network isolation: VM cannot reach non-allowlisted domains
- Proxy integration: VM can reach allowlisted domains with injected credentials

## CI Setup

**GitHub Actions (future):**

```yaml
jobs:
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test

  test-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test:integration

  # Tier 3 runs on self-hosted runner (Hetzner) — added in v0.2+
```
