# Secure VM Exposure — Design Doc

```
 /\_/\
( o.o )  let them peek, not steal
 > ^ <
```

## Problem

Agents running in microVMs sometimes expose services (web UIs, dev servers, browser-use VNC).
These need to be accessible to authorized users — but the VM must remain completely locked down.
No direct internet access, no public IPs, no open ports.

Port exposure is built into paws via a control plane reverse proxy. No external tunneling
dependencies required.

## Goals

1. **Expose configured ports only** — daemon defines which ports are accessible, everything else blocked
2. **OIDC SSO required** — every request authenticated via Dex/GitHub, no anonymous access
3. **Session-scoped URLs** — URL works only while session is active, destroyed with VM
4. **Self-hosted** — no Cloudflare Tunnel, no external dependencies
5. **K8s-ready** — works on single server and in K8s worker fleet

## Non-Goals

- Direct SSH access to VMs for users (agents use SSH internally, users don't)
- Persistent URLs that outlive sessions
- Public/unauthenticated access (use `access: 'pin'` for limited sharing)

---

## Architecture

```
User (browser)
  │
  │ https://s-abc123.fleet.tpops.dev/
  │
  ▼
┌─────────────────────────────────┐
│ Control Plane                   │
│                                 │
│  1. Extract session ID from     │
│     subdomain (s-abc123)        │
│  2. OIDC middleware validates   │
│     user token (via Dex)        │
│  3. Check user owns session     │
│     (or has PIN/email access)   │
│  4. Check requested path/port   │
│     is in daemon's expose list  │
│  5. Reverse-proxy to worker     │
│     that owns this session      │
└────────────┬────────────────────┘
             │ internal (Tailscale / K8s service)
             ▼
┌─────────────────────────────────┐
│ Worker                          │
│                                 │
│  6. Route to per-VM proxy       │
│     (172.16.x.1)                │
│  7. Forward to VM guest IP      │
│     (172.16.x.2:port)           │
└────────────┬────────────────────┘
             │ TAP device
             ▼
┌─────────────────────────────────┐
│ MicroVM (172.16.x.2)            │
│                                 │
│  Agent web UI on :8080          │
│  noVNC on :6080                 │
│  Dev server on :3000            │
│                                 │
│  (no internet, no secrets)      │
└─────────────────────────────────┘
```

### Key Insight

The control plane already proxies browser actions (`POST /v1/sessions/:id/browser/action`) to
workers. VM exposure is the same pattern generalized: the control plane is a reverse proxy for
any exposed port, with OIDC auth and session ownership checks.

---

## What to Build

### Phase 1: Reverse Proxy in Control Plane

**New route:** `ALL /s/:sessionId/*` (catch-all for exposed port traffic)

```typescript
// apps/control-plane/src/routes/expose.ts

app.all('/s/:sessionId/*', async (c) => {
  const sessionId = c.req.param('sessionId');
  const path = c.req.path.replace(`/s/${sessionId}`, '') || '/';

  // 1. Look up session
  const session = sessionStore.get(sessionId);
  if (!session || session.status !== 'running') return c.text('Not Found', 404);

  // 2. Authenticate (OIDC or PIN)
  const user = await validateAccess(c, session);
  if (!user) return c.redirect(dexLoginUrl);

  // 3. Check port is exposed
  const daemon = daemonStore.get(session.daemonRole);
  const expose = daemon?.network?.expose ?? [];
  const port = resolvePort(path, expose); // map path prefix → port
  if (!port) return c.text('Forbidden', 403);

  // 4. Reverse-proxy to worker
  const workerUrl = session.worker;
  return proxyToWorker(c, workerUrl, sessionId, port, path);
});
```

**Alternative: subdomain-based routing**

Instead of path-based (`fleet.tpops.dev/s/abc123/`), use subdomain-based
(`s-abc123.fleet.tpops.dev/`). This is cleaner for services that use absolute paths.

Requires:

- Wildcard DNS: `*.fleet.tpops.dev → control plane IP` (already exists)
- Wildcard TLS cert: cert-manager with DNS-01 challenge (Cloudflare solver)
- Control plane extracts session ID from `Host` header

Subdomain routing is recommended — most web apps break with path prefixes.

### Phase 2: Worker Inbound Proxy

**New route on worker:** `ALL /v1/sessions/:id/proxy/:port/*`

The worker already has the TAP device and knows the guest IP. It just needs to forward
inbound HTTP to the VM:

```typescript
// apps/worker/src/routes/proxy.ts

app.all('/v1/sessions/:id/proxy/:port/*', async (c) => {
  const { id, port } = c.req.param();
  const session = activeSessions.get(id);
  if (!session) return c.text('Not Found', 404);

  const guestIp = session.allocation.guestIp;
  const targetUrl = `http://${guestIp}:${port}${remainingPath}`;

  // Forward request to VM
  return fetch(targetUrl, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });
});
```

No iptables changes needed — the worker host already has a route to the guest IP via the TAP
device. The per-VM proxy (outbound MITM) is separate from this inbound path.

### Phase 3: WebSocket Support

For noVNC, live terminals, and HMR dev servers, the reverse proxy must handle WebSocket
upgrade:

```typescript
// Detect upgrade header
if (c.req.header('upgrade')?.toLowerCase() === 'websocket') {
  // Use raw socket proxying instead of fetch()
  return upgradeWebSocket(c, targetUrl);
}
```

Hono supports WebSocket via `@hono/node-ws` or Bun's native WebSocket.

### Phase 4: OIDC Middleware

```typescript
// apps/control-plane/src/middleware/expose-auth.ts

async function validateAccess(c: Context, session: Session): Promise<User | null> {
  const expose = session.network?.expose ?? [];
  const accessMode = expose[0]?.access ?? 'sso';

  switch (accessMode) {
    case 'sso':
      // Validate OIDC token from cookie/header
      // Check user is the session creator (or in allowed org)
      return validateOidcToken(c);

    case 'pin':
      // Check PIN in query param or prompt for it
      const pin = c.req.query('pin');
      return pin === session.exposedPorts?.[0]?.pin ? { type: 'pin' } : null;

    case 'email':
      // Validate OIDC token + check email in allowedEmails
      const user = await validateOidcToken(c);
      return user && expose[0]?.allowedEmails?.includes(user.email) ? user : null;
  }
}
```

---

## Type Changes

### Update `PortExposureSchema`

```typescript
// packages/domains/network/src/types.ts

/** Port to expose from the VM via control plane reverse proxy */
export const PortExposureSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['http', 'https']).default('http'),
  label: z.string().optional(),
  /** Access control: sso (OIDC login), pin (auto-generated PIN), email (allowlist) */
  access: PortAccessSchema.optional(),
  allowedEmails: z.array(z.string()).optional(),
  /** Optional path prefix (default: /). Requests to this path route to this port */
  pathPrefix: z.string().default('/'),
});
```

### Update `ExposedPortSchema` (URL now points to control plane)

```typescript
// packages/domains/session/src/types.ts

/** A port exposed from the VM via control plane */
export const ExposedPortSchema = z.object({
  port: z.number().int().min(1).max(65535),
  /** URL to access this port (e.g. https://s-abc123.fleet.tpops.dev) */
  url: z.string().url(),
  label: z.string().optional(),
  access: z.enum(['sso', 'pin', 'email']).optional(),
  pin: z.string().optional(),
  shareLink: z.string().url().optional(),
});
```

---

## URL Generation

When a session starts with `network.expose` configured:

```typescript
function generateExposedUrls(sessionId: string, expose: PortExposure[]): ExposedPort[] {
  const baseUrl = env.FLEET_DOMAIN; // e.g. "fleet.tpops.dev"

  return expose.map((e, i) => ({
    port: e.port,
    url: `https://s-${sessionId}.${baseUrl}${e.pathPrefix}`,
    label: e.label,
    access: e.access ?? 'sso',
    pin: e.access === 'pin' ? generatePin() : undefined,
    shareLink: generateShareLink(sessionId, e.port),
  }));
}
```

---

## Daemon Configuration Example

```yaml
name: 'pr-reviewer'
snapshot: 'claude-code-v2'
agent:
  framework: 'claude-code'
  prompt: 'Review the PR and post comments'

network:
  allowOut:
    - 'api.anthropic.com'
    - 'github.com'
    - '*.githubusercontent.com'
  credentials:
    api.anthropic.com:
      headers:
        x-api-key: '{{secrets.ANTHROPIC_KEY}}'
    github.com:
      headers:
        Authorization: 'Bearer {{secrets.GITHUB_TOKEN}}'
  expose:
    - port: 8080
      label: 'Agent Web UI'
      access: sso
    - port: 6080
      label: 'Browser View (noVNC)'
      access: sso

browser:
  enabled: true
  width: 1280
  height: 720
```

User visits `https://s-abc123.fleet.tpops.dev/` → GitHub login via Dex → proxied to port
8080 inside the VM. Agent web UI renders. VM has zero internet access except through the
credential-injecting outbound proxy.

---

## Implementation Order

| #     | Task                                      | Scope                                              | Depends on |
| ----- | ----------------------------------------- | -------------------------------------------------- | ---------- |
| ~~1~~ | ~~Remove Pangolin references~~ (DONE)     | ~~Types, worker, control plane, docs~~             | —          |
| 2     | Wildcard TLS cert                         | Ops repo (cert-manager DNS-01 + Cloudflare)        | —          |
| 3     | Worker inbound proxy route                | `apps/worker/src/routes/proxy.ts`                  | —          |
| 4     | Control plane reverse proxy               | `apps/control-plane/src/routes/expose.ts`          | 1, 3       |
| 5     | OIDC middleware for exposure              | `apps/control-plane/src/middleware/expose-auth.ts` | 4          |
| 6     | URL generation on session start           | Session executor                                   | 4          |
| 7     | WebSocket upgrade support                 | Control plane + worker proxy                       | 4          |
| 8     | Dashboard: exposed URLs in session detail | `apps/dashboard/`                                  | 6          |
| 9     | PIN + email access modes                  | OIDC middleware                                    | 5          |
| 10    | Share link generation (time-limited)      | Control plane                                      | 5          |

Tasks 1, 2, 3 can be parallelized. Tasks 4-6 are the critical path. Tasks 7-10 are
enhancements after the core loop works.

---

## Security Considerations

- **Session ownership** — control plane verifies the authenticated user created the session
  (or is in the same org for team access)
- **No direct VM access** — all traffic flows through control plane → worker → TAP. VM has
  no public IP, no internet, no route to anything except its /30 subnet
- **Port allowlist** — only ports in `network.expose` are routable. A daemon that doesn't
  configure `expose` has zero inbound access
- **OIDC tokens validated per-request** — not just at connection time. Cookie expiry enforced
- **WebSocket auth** — token validated on upgrade, connection killed if token expires
- **Rate limiting** — control plane rate limits proxy requests per session
  (prevent abuse of exposed services)
- **No credential leakage** — inbound proxy path is separate from outbound MITM proxy.
  Inbound traffic never sees injected credentials

---

## Architecture Benefits

| Property                      | How it works                     |
| ----------------------------- | -------------------------------- |
| No external tunnel dependency | Control plane reverse proxy      |
| K8s-native                    | Control plane is a pod           |
| Standard auth                 | Dex OIDC (GitHub, Google, etc.)  |
| Dynamic URLs                  | Per-session URLs, auto-generated |
| Automatic cleanup             | URL dies with session            |
| Zero additional infra         | Built into the control plane     |
