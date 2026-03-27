```
 /\_/\
( o.o )  paws
 > ^ <   a trust architecture that happens to use sandboxes
```

# paws

Your AI agent doesn't need your API keys. paws is a zero-trust credential injection layer for
background AI agents — secrets stay on the host, injected at the network layer by a per-VM TLS MITM
proxy. The agent never sees an API key. Not in env vars, not in memory, not on disk.

Each agent runs in an ephemeral Firecracker microVM with its own dedicated proxy, its own network
namespace, and its own ephemeral CA. The VM is disposable. If it's compromised, there's nothing
worth stealing.

## What is this?

paws is the execution layer for background agents and daemons — persistent roles that watch for
triggers and act autonomously. Think "keep PRs mergeable" not "fix this bug."

You provide:

- A snapshot (pre-built VM image with your agent runtime)
- A trigger (webhook, cron, or watch condition)
- A workload script (what to run when triggered)
- Credentials (injected by the platform, never exposed to the VM)

paws handles: VM lifecycle, snapshot boot (<1s), network isolation, credential proxying, fleet
scheduling, audit logging.

## Quick Example

```bash
# Run a one-shot session
curl -X POST https://paws.example.com/v1/sessions \
  -H "Authorization: Bearer $PAWS_API_KEY" \
  -d '{
    "snapshot": "claude-agent",
    "workload": {
      "script": "cd /workspace && claude-code --prompt \"Fix the login bug\""
    },
    "network": {
      "allowOut": ["api.anthropic.com", "github.com"],
      "credentials": {
        "api.anthropic.com": { "headers": { "x-api-key": "sk-ant-..." } },
        "github.com": { "headers": { "Authorization": "Bearer ghp_..." } }
      }
    }
  }'
```

```bash
# Register a daemon (persistent role)
curl -X POST https://paws.example.com/v1/daemons \
  -H "Authorization: Bearer $PAWS_API_KEY" \
  -d '{
    "role": "pr-helper",
    "description": "Review PRs and fix CI failures",
    "snapshot": "claude-agent",
    "trigger": { "type": "webhook", "events": ["pull_request.opened"] },
    "workload": { "script": "cd /state/repo && git pull && claude-code --prompt \"$TRIGGER_PAYLOAD\"" },
    "network": {
      "allowOut": ["api.anthropic.com", "github.com", "*.github.com"],
      "credentials": { ... }
    },
    "governance": { "maxActionsPerHour": 20, "auditLog": true }
  }'
```

## Architecture

```
GitHub webhook → Gateway (control plane)
                    │
                    ├── Auth + rate limiting
                    ├── Session tracking
                    ├── LLM history (proxied conversations)
                    │
                    └── Routes to Worker node
                           │
                           ├── Spawns TLS proxy (per-VM, isolated)
                           ├── Restores Firecracker VM from snapshot (<1s)
                           ├── iptables routes VM traffic → proxy
                           ├── Proxy injects credentials per domain
                           │
                           └── VM runs agent (zero secrets inside)
                                 │
                                 ├── git clone → proxy injects GitHub token
                                 ├── Claude API → proxy injects API key
                                 └── Result returned → VM destroyed
```

See [docs/architecture.md](docs/architecture.md) for the full design.

## Getting Started

```bash
# 1. Clone and install
git clone https://github.com/arek-e/paws
cd paws && bun install

# 2. Configure
cp .env.example .env    # edit with your settings

# 3. Bootstrap the server (installs Firecracker, kernel, rootfs, SSH keys)
sudo ./scripts/bootstrap-node.sh

# 4. Start gateway + worker
bun run start
```

Then try the [examples](examples/):

```bash
export PAWS_URL=http://localhost:4000
export PAWS_API_KEY=paws-dev-key

bash examples/01-health-check.sh   # verify services are up
bash examples/02-hello-world.sh    # run a script in an isolated VM
```

Full walkthrough: [docs/getting-started.md](docs/getting-started.md)

## Key Properties

- **Zero-trust credential injection** — per-VM TLS MITM proxy injects secrets at the network layer; the agent never touches an API key
- **Per-VM isolation** — every session gets its own proxy, its own network namespace, its own ephemeral CA
- **Network allowlisting** — only approved domains reachable; everything else dropped at the firewall
- **Sub-second boot** — Firecracker snapshot restore (~28ms with userfaultfd)
- **Ephemeral by default** — VMs are created per trigger, destroyed after
- **Persistent state** — LLM conversation history in gateway DB + mounted volumes for files/repos
- **Spec-first API** — OpenAPI spec generated from code, SDKs auto-generated for any language
- **Provider-agnostic** — pluggable host providers (Hetzner, AWS, etc.)

## Docs

- [Getting Started](docs/getting-started.md) — deploy and run your first agent
- [Architecture](docs/architecture.md) — full system design
- [Security Model](docs/security.md) — zero-trust, credential injection, network isolation
- [API Reference](docs/api.md) — gateway endpoints
- [Examples](examples/) — runnable demo scripts
- [Testing](docs/testing.md) — three-tier test strategy, TDD approach
- [Roadmap](docs/roadmap.md) — what's built, what's next

## Status

Early development. v0.1 (single server, core loop) is complete. See [roadmap](docs/roadmap.md).

## License

Apache 2.0
