---
title: Security Model
description: Zero-trust credential injection -- how paws keeps secrets out of the VM.
---

The core principle: your agent has nothing worth stealing. The VM holds no credentials, no persistent state worth protecting. If an attacker compromises the VM, they get a Linux shell with no API keys and a filesystem that will be destroyed when the session ends.

## What enters the VM

| Value               | Purpose                           | Sensitivity                          |
| ------------------- | --------------------------------- | ------------------------------------ |
| `SESSION_TOKEN`     | Identify session to control plane | Low -- expires on completion         |
| `GATEWAY_URL`       | Report status back                | Low -- internal URL                  |
| `TRIGGER_PAYLOAD`   | Event that triggered this session | Varies -- sanitized by control plane |
| Per-session CA cert | Trust the MITM proxy's TLS certs  | Low -- ephemeral, per-session        |

## What does NOT enter the VM

- API keys (Anthropic, OpenAI, etc.)
- GitHub tokens
- Database credentials
- S3 credentials
- Any secret from the daemon's credential config

## Per-VM TLS proxy

Each VM gets a dedicated proxy process on the host. The proxy holds that session's credentials and nothing else.

```
Agent in VM: curl https://api.anthropic.com/v1/messages
  |
  +-- VM resolves api.anthropic.com (real IP)
  +-- iptables DNAT rewrites destination -> proxy at 172.16.x.1:8443
  +-- Proxy reads SNI: "api.anthropic.com"
  |
  +-- Domain in allowlist?
  |     YES: terminate TLS, inject x-api-key header, forward
  |     NO:  drop connection (TCP RST)
  |
  +-- Agent sees normal HTTPS response
      Never saw the API key.
```

### Proxy lifecycle

1. Session starts -- proxy process spawned, bound to `172.16.x.1:8443`
2. Configuration loaded -- allowlisted domains + credential headers from daemon config
3. Per-session CA generated -- ECDSA P-256 keypair + self-signed cert (24hr TTL)
4. CA injected into VM -- written to trust store before workload starts
5. Traffic interception -- iptables DNAT routes ports 80/443 to proxy
6. Session ends -- proxy killed, config purged from memory

### Git credential injection

Git over HTTPS works transparently. When the agent runs `git clone https://github.com/org/repo`, the proxy intercepts the connection, injects the `Authorization: Bearer ghp_...` header, and forwards to GitHub. The agent never sees the token. No credential helpers, no SSH keys, no `.netrc` in the VM.

## Network isolation

Each VM gets:

- Dedicated TAP device
- Unique /30 subnet (`172.16.x.1` host, `172.16.x.2` guest)
- iptables: DNAT 80/443 to proxy, DROP everything else

The VM cannot reach the internet directly, cannot reach other VMs on the same host, cannot reach host services, and cannot reach the cloud metadata endpoint.

## Threat model

**What paws protects against:**

- **Prompt injection leading to credential exfiltration** -- there are no keys in the VM to leak
- **VM escape and lateral movement** -- per-VM proxy isolation means compromising one proxy doesn't leak other sessions' secrets
- **Rogue agent behavior** -- network allowlist blocks unauthorized domains, governance layer rate-limits actions
- **Snapshot poisoning** -- snapshots are checksummed and verified on restore

**Out of scope:** Firecracker kernel exploits (same trust model as AWS Lambda), physical host compromise, malicious platform operator.

## Governance

The control plane enforces per-daemon policies:

- **Rate limiting** -- cap invocations per hour (`maxActionsPerHour`)
- **Approval gates** -- hold certain actions for human approval (`requiresApproval: ["merge", "deploy"]`)
- **Audit logging** -- every trigger, session, LLM call, and outbound request is logged with timestamps and session IDs
