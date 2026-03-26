# Getting Started

```
 /\_/\
( o.o )  let's get those paws moving
 > ^ <
```

## Prerequisites

- A Linux server with KVM support (`/dev/kvm` must exist)
- Root access (Firecracker needs it for TAP devices and iptables)
- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- At least 8 GB RAM and 20 GB disk

Tested on: Ubuntu 24.04, Hetzner Dedicated (AX41-NVMe).

## 1. Clone and Install

```bash
git clone https://github.com/paws-dev/paws
cd paws
bun install
```

## 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Gateway
PAWS_API_KEY=your-secret-api-key
GATEWAY_PORT=8080

# Worker
WORKER_PORT=3000
MAX_CONCURRENT_VMS=5
MAX_QUEUE_SIZE=10

# Firecracker
PAWS_DATA_DIR=/var/lib/paws
VM_VCPU_COUNT=2
VM_MEMORY_MB=4096
VM_TIMEOUT_MS=600000
```

## 3. Install Firecracker

```bash
sudo ./scripts/install-firecracker.sh
```

This installs:

- `firecracker` binary to `/usr/local/bin/`
- Default kernel to `$PAWS_DATA_DIR/kernels/vmlinux-default`
- Base rootfs to `$PAWS_DATA_DIR/rootfs/ubuntu-default.ext4`
- SSH keypair to `$PAWS_DATA_DIR/ssh/`

## 4. Build Your First Snapshot

```bash
# Start the worker (needed for snapshot building)
bun run apps/worker/src/server.ts &

# Build a snapshot with your agent tools pre-installed
curl -X POST http://localhost:3000/snapshots/build \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-agent",
    "setup": "apt-get update && apt-get install -y git nodejs && npm install -g @anthropic-ai/claude-code"
  }'
```

This boots a fresh VM, runs your setup script, then snapshots the full state (memory + disk + CPU).
Takes a few minutes the first time. Future sessions boot from this snapshot in <1 second.

## 5. Start the Services

```bash
# Terminal 1: Worker
bun run apps/worker/src/server.ts

# Terminal 2: Gateway
bun run apps/gateway/src/server.ts
```

Or use the combined launcher:

```bash
bun run start
```

## 6. Run a Session

```bash
# Simple test — run a script in an isolated VM
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer $PAWS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot": "my-agent",
    "workload": {
      "type": "script",
      "script": "echo hello from paws && uname -a"
    },
    "network": {
      "allowOut": []
    }
  }'
# → { "sessionId": "abc-123", "status": "pending" }

# Poll for result
curl http://localhost:8080/v1/sessions/abc-123 \
  -H "Authorization: Bearer $PAWS_API_KEY"
# → { "status": "completed", "stdout": "hello from paws\nLinux ...\n" }
```

## 7. Run an Agent with Credentials

```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer $PAWS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot": "my-agent",
    "workload": {
      "type": "script",
      "script": "cd /workspace && git clone https://github.com/myorg/myrepo && cd myrepo && claude-code --prompt \"Fix the failing test in auth.ts\""
    },
    "network": {
      "allowOut": ["api.anthropic.com", "github.com", "*.github.com"],
      "credentials": {
        "api.anthropic.com": {
          "headers": { "x-api-key": "sk-ant-your-key" }
        },
        "github.com": {
          "headers": { "Authorization": "Bearer ghp_your-token" }
        }
      }
    },
    "timeoutMs": 300000
  }'
```

The agent runs in a Firecracker VM. It can clone from GitHub and call Claude — but it never sees the
API keys. The per-VM TLS proxy injects them at the network layer.

## 8. Register a Daemon

```bash
# Register a daemon that triggers on GitHub webhooks
curl -X POST http://localhost:8080/v1/daemons \
  -H "Authorization: Bearer $PAWS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "pr-reviewer",
    "description": "Review new PRs automatically",
    "snapshot": "my-agent",
    "trigger": {
      "type": "webhook",
      "events": ["pull_request.opened"]
    },
    "workload": {
      "type": "script",
      "script": "cd /state/repo && git pull && claude-code --prompt \"Review this PR: $TRIGGER_PAYLOAD\""
    },
    "network": {
      "allowOut": ["api.anthropic.com", "github.com", "*.github.com"],
      "credentials": {
        "api.anthropic.com": { "headers": { "x-api-key": "sk-ant-..." } },
        "github.com": { "headers": { "Authorization": "Bearer ghp_..." } }
      }
    },
    "governance": {
      "maxActionsPerHour": 10,
      "auditLog": true
    }
  }'
```

Then point your GitHub webhook at `https://your-server:8080/v1/webhooks/pr-reviewer`.

Every time a PR is opened, paws spins up an isolated VM, runs your agent, and destroys it when done.
The `/state/repo` directory persists between invocations so the repo doesn't need a full clone every
time.

## Next Steps

- [Architecture](architecture.md) — understand the full system design
- [Security Model](security.md) — how the zero-trust model works
- [API Reference](api.md) — all gateway endpoints
- [Roadmap](roadmap.md) — what's coming next
