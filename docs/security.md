# Security Model

```
  /\_/\
 ( o.o )  zero trust, zero secrets
  > ^ <
```

## Core Principle

> Your agent should have nothing worth stealing and nothing worth preserving.
> — Browser Use

The VM is disposable. It holds no credentials, no persistent state worth protecting. If an attacker compromises the VM, they get:
- A Linux shell with no API keys
- Network access to only one endpoint: their own session's proxy (which validates session tokens)
- A filesystem that will be destroyed when the session ends

## Threat Model

### What we protect against

1. **Prompt injection → credential exfiltration** — malicious input tricks the agent into leaking API keys. Mitigated: there are no keys in the VM to leak.
2. **VM escape → lateral movement** — attacker breaks out of Firecracker and reaches the host. Mitigated: per-VM proxy isolation means even a host-level compromise of one proxy doesn't leak other sessions' secrets.
3. **Agent gone rogue** — agent starts making unauthorized API calls. Mitigated: network allowlist blocks all non-approved domains. Governance layer rate-limits actions.
4. **Snapshot poisoning** — compromised snapshot contains a backdoor. Mitigated: snapshots are built from declared configs, checksummed, and verified on restore.

### What we don't protect against (out of scope for v0.1)

- Firecracker kernel exploits (mitigated by KVM isolation — same trust model as AWS Lambda)
- Physical host compromise
- Malicious platform operator (they control the gateway and all secrets)

## Zero-Secret VM Architecture

### What enters the VM

| Value | Purpose | Sensitivity |
|---|---|---|
| `SESSION_TOKEN` | Identify session to gateway | Low — only valid for this session, expires on completion |
| `GATEWAY_URL` | Report status back to gateway | Low — internal URL |
| `TRIGGER_PAYLOAD` | The event that triggered this session | Varies — webhook body, sanitized by gateway |
| Per-session CA cert | Trust the MITM proxy's TLS certs | Low — ephemeral, per-session, useless outside the VM |

### What does NOT enter the VM

- API keys (Anthropic, OpenAI, etc.)
- GitHub tokens
- Database credentials
- S3 credentials
- Any secret from the daemon's credential configuration

## Per-VM TLS MITM Proxy

### How it works

Each VM gets a dedicated proxy process running on the host, bound to the host-side TAP IP.

```
┌─────────────────────────────────────────────┐
│ Host                                         │
│                                              │
│  ┌────────────────┐                          │
│  │ Proxy (VM 1)   │ ← knows VM 1's secrets  │
│  │ 172.16.0.1:8443│   only                   │
│  └───────┬────────┘                          │
│          │ iptables DNAT                     │
│  ┌───────┴────────┐                          │
│  │ Firecracker    │                          │
│  │ VM 1           │                          │
│  │ 172.16.0.2     │ ← zero secrets           │
│  └────────────────┘                          │
│                                              │
│  ┌────────────────┐                          │
│  │ Proxy (VM 2)   │ ← knows VM 2's secrets  │
│  │ 172.16.4.1:8443│   only                   │
│  └───────┬────────┘                          │
│          │ iptables DNAT                     │
│  ┌───────┴────────┐                          │
│  │ Firecracker    │                          │
│  │ VM 2           │                          │
│  │ 172.16.4.2     │ ← zero secrets           │
│  └────────────────┘                          │
└──────────────────────────────────────────────┘
```

### Proxy lifecycle

1. **Session starts** → proxy process spawned, bound to `172.16.x.1:8443`
2. **Configuration loaded** → allowlisted domains + credential headers from daemon config
3. **Per-session CA generated** → ECDSA P-256 keypair + self-signed CA cert (24hr TTL)
4. **CA injected into VM** → written to VM trust store before workload starts
5. **Traffic interception** → iptables DNAT routes VM ports 80/443 to proxy
6. **Session ends** → proxy process killed, config purged from memory

### Request flow

```
Agent in VM: curl https://api.anthropic.com/v1/messages -d '...'
  │
  ├─ VM resolves api.anthropic.com → real IP
  ├─ VM initiates TCP to real IP:443
  ├─ iptables DNAT rewrites destination → 172.16.x.1:8443 (proxy)
  ├─ Proxy receives connection, reads SNI: "api.anthropic.com"
  │
  ├─ Is api.anthropic.com in allowlist?
  │   ├─ YES:
  │   │   ├─ Proxy terminates TLS using per-session CA cert
  │   │   ├─ Reads HTTP request
  │   │   ├─ Injects configured headers: { "x-api-key": "sk-ant-..." }
  │   │   ├─ Opens real TLS connection to api.anthropic.com:443
  │   │   ├─ Forwards request with injected headers
  │   │   └─ Streams response back to VM
  │   │
  │   └─ NO:
  │       └─ Proxy drops connection (TCP RST)
  │
  └─ Agent sees a normal HTTPS response (trusts proxy CA)
```

### Git credential injection

Git over HTTPS works transparently:

```
Agent: git clone https://github.com/org/repo
  → TCP to github.com:443
  → DNAT to proxy
  → Proxy: github.com is allowlisted
  → Proxy injects: Authorization: Bearer ghp_...
  → Proxy forwards to real github.com
  → Git clone succeeds — agent never sees the token
```

`git push`, `git pull`, `git fetch` all work the same way. No credential helpers, no SSH keys, no `.netrc` file in the VM.

### What the proxy intercepts vs passes through

| Domain | Action | Why |
|---|---|---|
| Allowlisted + has credentials | TLS terminate, inject headers, forward | Credential injection |
| Allowlisted, no credentials | TLS terminate, forward as-is | Allow access (e.g., npm registry) |
| Not allowlisted | Drop connection | Block unauthorized access |

## Network Isolation

### Per-VM network

Each Firecracker VM gets:
- Dedicated TAP device (`tap0`, `tap1`, ...)
- Unique /30 subnet (`172.16.{4*n}.0/30`)
- Host-side IP: `172.16.{4*n+1}` (where proxy listens)
- Guest-side IP: `172.16.{4*n+2}`

### iptables rules per VM

```bash
# Route HTTP/HTTPS to this VM's proxy
iptables -t nat -A PREROUTING -i tap{n} -p tcp --dport 80  -j DNAT --to 172.16.x.1:8080
iptables -t nat -A PREROUTING -i tap{n} -p tcp --dport 443 -j DNAT --to 172.16.x.1:8443

# Allow traffic to proxy
iptables -A FORWARD -i tap{n} -d 172.16.x.1 -j ACCEPT

# Allow established connections back
iptables -A FORWARD -o tap{n} -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# Block everything else from this VM
iptables -A FORWARD -i tap{n} -j DROP
```

The VM cannot:
- Reach the internet directly
- Reach other VMs on the same host
- Reach the host's other services
- Reach the cloud metadata endpoint (169.254.169.254)

## Governance Layer

Per-daemon policy enforcement at the gateway level:

### Rate limiting
```json
{ "maxActionsPerHour": 20 }
```
Gateway counts trigger-invocations per daemon role. Excess triggers are queued or dropped.

### Approval gates
```json
{ "requiresApproval": ["merge", "deploy"] }
```
If the agent's output contains actions matching these patterns, the gateway holds the result and notifies the user for approval before executing.

### Audit logging
```json
{ "auditLog": true }
```
Every trigger event, session start/stop, LLM call (prompt + response), and outbound HTTP request is logged with timestamps and session IDs. Full provenance chain.

## Snapshot Security

### Build process
1. Snapshot config declared in YAML (base image, setup script, packages)
2. Fresh VM booted from base kernel + rootfs
3. Setup script runs in isolation
4. VM paused, memory + disk + vmstate saved
5. Snapshot checksummed (SHA-256 per file)
6. Manifest stored alongside snapshot

### Verification on restore
- Worker verifies checksums before restoring from snapshot
- Snapshot files are read-only on the host filesystem
- Disk is copied (CoW) per session — VMs cannot modify the base snapshot

## Prior Art

This security model is informed by:
- **[Browser Use](https://browser-use.com/posts/two-ways-to-sandbox-agents)** — Pattern 2: Agent Isolation, control plane as credential proxy
- **[Matchlock](https://github.com/jingkaihe/matchlock)** — MITM proxy with per-host secret injection, agent sees placeholders only
- **[nono](https://github.com/always-further/nono)** — Proxy-mode credential injection, kernel-enforced sandbox
- **[E2B](https://github.com/e2b-dev/E2B/issues/1160)** — Per-sandbox ephemeral CA, selective TLS MITM, domain allowlisting
- **[GitHub Agentic Workflows](https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/)** — Firewalled egress, MCP gateway, API proxy
