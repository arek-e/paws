<div align="center">

<img src="https://raw.githubusercontent.com/arek-e/paws/main/assets/logo.svg" width="100" alt="paws logo">

# paws

**Protected Agent Workflow System**

Self-hosted zero-trust infrastructure for AI agents.
Secrets never enter the sandbox.

[![CI](https://github.com/arek-e/paws/actions/workflows/ci.yml/badge.svg)](https://github.com/arek-e/paws/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/arek-e/paws)](LICENSE)
[![Release](https://img.shields.io/github/v/release/arek-e/paws)](https://github.com/arek-e/paws/releases)

[Website](https://getpaws.dev) &middot; [Docs](https://getpaws.dev/getting-started/install/) &middot; [Issues](https://github.com/arek-e/paws/issues)

</div>

---

## The Problem

Your AI agent needs API keys to work. But giving an agent your keys means trusting it completely -- with your Anthropic key, your GitHub token, your database credentials.

If the agent gets compromised -- prompt injection, rogue behavior, VM escape -- those keys are gone.

**paws solves this.** A per-VM TLS proxy injects credentials at the network layer. The agent sees normal HTTPS responses but never touches an API key. Not in env vars. Not in memory. Not on disk.

Each agent runs in an ephemeral [Firecracker](https://firecracker-microvm.github.io/) microVM with its own dedicated proxy, its own network namespace, and its own ephemeral CA certificate. If the VM is compromised, there is nothing worth stealing.

## How It Works

```
Agent in VM                         Host
    |                                |
    |  curl api.anthropic.com        |
    |------------------------------->|
    |        iptables DNAT           |
    |                     +----------+----------+
    |                     |    TLS Proxy (1:1)  |
    |                     |                     |
    |                     |  1. Check allowlist  |
    |                     |  2. Terminate TLS    |
    |                     |  3. Inject x-api-key |
    |                     |  4. Forward request  |
    |                     +----------+----------+
    |                                |
    |                       api.anthropic.com
    |                                |
    |<------- normal HTTPS response -|
    |                                |
    |  The agent never saw the key.  |
```

Git works the same way -- `git clone`, `git push`, `git pull` all go through the proxy. Authorization headers are injected transparently. No credential helpers, no SSH keys, no `.netrc` in the VM.

## Quick Start

```bash
curl -fsSL https://getpaws.dev/install.sh | bash
```

This installs the control plane + worker on a Linux server with `/dev/kvm`. Then:

```bash
# Run your first agent session
curl -X POST https://your-server:4000/v1/sessions \
  -H "Authorization: Bearer $PAWS_API_KEY" \
  -d '{
    "snapshot": "claude-agent",
    "workload": {
      "script": "Review this PR and post comments"
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

The API keys in that request never enter the VM. They stay on the host, injected by the proxy.

## Features

|                        | Feature                    | Description                                                             |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------- |
| :lock:                 | **Zero-trust credentials** | Per-VM TLS MITM proxy injects API keys at the network layer             |
| :zap:                  | **Sub-second boot**        | Firecracker memory snapshots restore VMs in <800ms                      |
| :bar_chart:            | **Dashboard**              | Fleet management, session history, daemon config, audit log             |
| :robot:                | **Daemon workflows**       | Persistent agent roles triggered by webhooks, cron, or GitHub events    |
| :shield:               | **Governance**             | Rate limits, approval gates, full audit logging per daemon              |
| :electric_plug:        | **MCP Gateway**            | Connect agents to MCP tool servers running on the host                  |
| :globe_with_meridians: | **Port exposure**          | Agents expose web apps via Pangolin tunnels with SSO/PIN access control |
| :computer:             | **CLI**                    | `paws run`, `paws top`, `paws logs` -- one-command agent execution      |
| :package:              | **SDKs**                   | TypeScript and Python clients, generated from OpenAPI spec              |

## Architecture

```
+---------------------------------------------------+
|                  Control Plane                     |
|    API  -  Dashboard  -  Governance  -  Daemons    |
+------------------+----------------+---------------+
                   |                |
        +----------v------+  +-----v-----------+
        |    Worker 1     |  |    Worker 2      |
        |  +-----------+  |  |  +-----------+   |
        |  |Firecracker|  |  |  |Firecracker|   |
        |  |  microVM  |  |  |  |  microVM  |   |
        |  | (no keys) |  |  |  | (no keys) |   |
        |  +-----+-----+  |  |  +-----+-----+   |
        |  +-----v-----+  |  |  +-----v-----+   |
        |  | TLS Proxy  |  |  |  | TLS Proxy  |  |
        |  | injects    |  |  |  | injects    |  |
        |  | x-api-key  |  |  |  | auth token |  |
        |  +-----+-----+  |  |  +-----+-----+   |
        +--------+--------+  +--------+---------+
                 |                     |
          api.anthropic.com       github.com
```

- **Control plane** holds all credentials, dispatches sessions, enforces governance
- **Workers** run on bare metal with `/dev/kvm`, each VM gets a dedicated TLS proxy
- **One proxy per VM** -- never shared, spawned with the VM, killed with the VM
- VMs boot from Firecracker memory snapshots in <800ms
- Workers auto-register via WireGuard tunnels (Pangolin/Newt)

## Comparison

|                      | paws                    | E2B                 | Daytona         | Microsandbox    |
| -------------------- | ----------------------- | ------------------- | --------------- | --------------- |
| **Secret injection** | Network-layer MITM      | No                  | No              | Network-layer   |
| **Self-hosted**      | Yes                     | OSS option          | Enterprise only | Yes             |
| **Dashboard**        | Full platform           | No                  | Yes             | No              |
| **Governance**       | Rate limits + approvals | No                  | No              | No              |
| **Isolation**        | Firecracker microVM     | Firecracker microVM | Docker          | libkrun microVM |
| **Daemon workflows** | Yes                     | No                  | No              | No              |
| **Boot time**        | <800ms (snapshot)       | ~150ms              | ~90ms           | ~200ms          |

## SDKs

**TypeScript:**

```typescript
import { createClient } from '@paws/sdk';

const paws = createClient({
  baseUrl: 'https://your-server:4000',
  apiKey: 'paws-...',
});

const session = await paws.sessions.create({
  snapshot: 'claude-code',
  workload: { type: 'script', script: 'Review this PR' },
});
```

**Python:**

```python
from paws import PawsClient

client = PawsClient(base_url="https://your-server:4000", api_key="paws-...")
session = client.sessions.create(
    snapshot="claude-code",
    workload={"type": "script", "script": "Review this PR"},
)
```

## Documentation

Full docs at **[getpaws.dev](https://getpaws.dev)**

- [Installation](https://getpaws.dev/getting-started/install/)
- [Quick Start](https://getpaws.dev/getting-started/quickstart/)
- [Architecture](https://getpaws.dev/concepts/architecture/)
- [Security Model](https://getpaws.dev/concepts/security/)
- [API Reference](https://getpaws.dev/reference/api/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and conventions.

```bash
bun install          # install deps
bun test             # run tests
bun run check        # lint + typecheck + format
bun run start        # start control-plane + worker
```

## License

[Apache-2.0](LICENSE)

---

<div align="center">
<pre>
 /\_/\
( o.o )  paws — because your agent should have
 > ^ <   nothing worth stealing
</pre>
</div>
