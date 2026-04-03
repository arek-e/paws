# Collaborative Sessions — Design Doc

```
 /\_/\
( o.o )  pair programming with cats
 > ^ <
```

## Problem

Today paws sessions are fire-and-forget: trigger fires, VM boots, agent runs script, VM destroyed.
This is fine for background automation (CI review, cron jobs), but doesn't support the most
valuable use case: **a developer and an agent working together on a task until it ships.**

The developer needs to:

- See the running app (frontend on :3000, backend on :3001) via a live preview URL
- Watch the agent's work in real-time (terminal, file changes, browser)
- Give the agent feedback and course-correct
- Test changes in the browser before shipping
- Ship a PR when the task is done
- Close the session and destroy the VM

This is the Eva/Devin model — not fire-and-forget, but collaborative.

## Prior Art

| Product               | Model         | Port Exposure                                   | Dev UX                                             |
| --------------------- | ------------- | ----------------------------------------------- | -------------------------------------------------- |
| **Eva**               | Collaborative | Daytona signed URLs per port, port picker in UI | Split-pane: chat + preview/editor/terminal/desktop |
| **Devin**             | Collaborative | `expose_port` → `*.devinapps.com`               | Replay timeline + live shell/editor/browser        |
| **Background Agents** | Async         | Code-server only (Modal tunnels)                | WebSocket event stream, multiplayer                |
| **Codex**             | Async         | None                                            | Review diffs when done                             |
| **Copilot Workspace** | Hybrid        | Codespaces port forwarding                      | Plan → implement → validate → PR                   |

**We want the Eva/Devin model** — collaborative, live preview, real-time visibility — but self-
hosted, no SaaS dependencies, and built on paws's zero-secret VM architecture.

---

## Session Lifecycle

```
1. MISSION CREATED
   Developer describes a task: "Add dark mode to the settings page"
   Optionally selects: repo, branch, daemon config, exposed ports

2. VM BOOTS (<1s from snapshot)
   ├── Firecracker VM restored from snapshot
   ├── Per-VM MITM proxy spawned (credential injection)
   ├── agentgateway config written (MCP tool access)
   ├── iptables DNAT rules applied
   ├── Git repo cloned/pulled (via proxy → GitHub with injected token)
   └── Dev server started (npm run dev → :3000, :3001)

3. SESSION URL ACTIVE
   Developer gets: https://s-{sessionId}.paws.example.com/
   ├── /preview/:port  — live app preview (iframe to dev server)
   ├── /terminal        — PTY session into the VM
   ├── /editor          — code-server (VS Code in browser)
   ├── /chat            — send prompts to the agent
   └── /desktop         — VNC (if browser-use/Xvfb is enabled)

4. COLLABORATION LOOP
   ┌──────────────────────────────────────────────────┐
   │                                                   │
   │  Developer sees live preview ← agent makes changes│
   │       │                              ↑             │
   │       ▼                              │             │
   │  Developer gives feedback ──→ agent adjusts       │
   │       │                              ↑             │
   │       ▼                              │             │
   │  Developer tests in browser ─→ "looks good"       │
   │                                                   │
   └──────────────────────────────────────────────────┘

5. SHIP
   Developer (or agent) creates a PR from the session branch
   PR includes: diff, screenshots, session replay link

6. SESSION CLOSED
   ├── VM destroyed (guaranteed cleanup)
   ├── MITM proxy killed
   ├── agentgateway config removed
   ├── TAP device + iptables cleaned up
   ├── Session replay preserved (audit log)
   └── State volume snapshot taken (optional, for resuming)
```

---

## Port Exposure Architecture

Built on `docs/design-vm-exposure.md`. The control plane is a reverse proxy for exposed VM ports.

### How it works

```
Developer browser
  │
  │ https://s-abc123.paws.example.com/preview/3000/
  │
  ▼
┌───────────────────────────────────────────────┐
│ Control Plane (Gateway)                        │
│                                                │
│  1. Parse session ID from subdomain (s-abc123) │
│  2. Auth: OIDC (GitHub/Google) or session PIN  │
│  3. Check port 3000 is in daemon's expose list │
│  4. Look up which worker owns this session     │
│  5. Reverse-proxy → worker                     │
│                                                │
└───────────────┬───────────────────────────────┘
                │ ClusterIP (K8s) or direct (single-server)
                ▼
┌───────────────────────────────────────────────┐
│ Worker                                         │
│                                                │
│  6. Route to session's VM                      │
│  7. Forward to VM guest IP (172.16.x.2:3000)  │
│     via the TAP device (INBOUND, not DNAT)     │
│                                                │
└───────────────┬───────────────────────────────┘
                │ TAP device
                ▼
┌───────────────────────────────────────────────┐
│ MicroVM (172.16.x.2)                           │
│                                                │
│  Next.js dev server on :3000  ← HMR works     │
│  Express API on :3001                          │
│  Vite on :5173                                 │
│  Whatever the developer's stack needs          │
│                                                │
│  (zero secrets, locked-down egress)            │
└───────────────────────────────────────────────┘
```

### Inbound vs Outbound — two different paths

This is important to understand. Outbound (VM → internet) and inbound (developer → VM) traffic
take completely different paths:

```
OUTBOUND (agent makes API call):
  VM :443 → iptables DNAT → MITM proxy (172.16.x.1:8443) → internet
  Proxy enforces: domain allowlist, credential injection

INBOUND (developer views preview):
  Developer → control plane → worker → TAP → VM :3000
  Control plane enforces: auth, port allowlist, session ownership
  Worker forwards directly to VM guest IP on the TAP device
  No MITM proxy involved — this is a simple TCP forward
```

The MITM proxy only handles OUTBOUND traffic. Inbound preview traffic bypasses it entirely —
the worker opens a direct TCP connection to the VM's guest IP on the allowed port.

### WebSocket support (critical for dev servers)

Dev servers use WebSockets for HMR (hot module replacement). The reverse proxy chain must support
WebSocket upgrade:

```
Browser (HMR WebSocket)
  → control plane (HTTP Upgrade → WebSocket proxy)
  → worker (WebSocket proxy)
  → VM :3000 (Vite/Next.js HMR endpoint)
```

Both the control plane and worker reverse proxies must handle `Connection: Upgrade` headers and
establish bidirectional WebSocket tunnels. Hono supports this via `c.req.raw` + native WebSocket
APIs.

### Port readiness detection

Before showing the preview iframe, the dashboard should check if the dev server is actually
listening. Pattern from Eva:

```
Dashboard polls: GET /s/{sessionId}/health/{port}
  → Worker checks: TCP connect to 172.16.x.2:{port}
  → Returns: { ready: true } or { ready: false }

Dashboard shows:
  - Spinner while ready=false
  - Live iframe when ready=true
  - Auto-refreshes on HMR WebSocket reconnect
```

---

## Dashboard UX — Split Pane

```
┌──────────────────────────────────────────────────────────────────┐
│  🐾 paws — session s-abc123                     [Ship PR] [End] │
├─────────────────────────────┬────────────────────────────────────┤
│                             │  [Preview] [Terminal] [Editor]     │
│  CHAT                       │                                    │
│                             │  ┌──────────────────────────────┐  │
│  🤖 Agent: I've added the  │  │                              │  │
│  dark mode toggle to the   │  │  Live preview (:3000)        │  │
│  settings page. The theme  │  │                              │  │
│  persists in localStorage. │  │  ┌────────────────────────┐  │  │
│                             │  │  │ Settings              │  │  │
│  👤 You: Looks good but    │  │  │                        │  │  │
│  the toggle animation is   │  │  │ [🌙 Dark Mode: ON ]   │  │  │
│  janky. Can you smooth it? │  │  │                        │  │  │
│                             │  │  │ Theme: Dark           │  │  │
│  🤖 Agent: Fixed. I added  │  │  └────────────────────────┘  │  │
│  a 200ms CSS transition.   │  │                              │  │
│  Check the preview.        │  │                              │  │
│                             │  └──────────────────────────────┘  │
│                             │                                    │
│  ┌───────────────────────┐  │  Port: [3000 ▼]  Status: ● Live  │
│  │ Type a message...     │  │                                    │
│  └───────────────────────┘  │                                    │
├─────────────────────────────┴────────────────────────────────────┤
│  Files changed: 3  │  Branch: feat/dark-mode  │  ⏱ 12m active  │
└──────────────────────────────────────────────────────────────────┘
```

### Tabs on the right pane

| Tab          | What                | How                                      |
| ------------ | ------------------- | ---------------------------------------- |
| **Preview**  | Live app in iframe  | `<iframe src="/s/{id}/preview/{port}/">` |
| **Terminal** | PTY into the VM     | WebSocket → worker → SSH → VM shell      |
| **Editor**   | VS Code in browser  | code-server running in VM on :8443       |
| **Desktop**  | VNC for browser-use | noVNC → Xvfb+Chromium in VM              |

### Port picker

Like Eva, include a port input in the preview tab. The developer can switch between :3000
(frontend), :3001 (API), :5173 (Vite), etc. Each port change fetches a new preview URL.

---

## Real-Time Streaming

The developer needs to see what the agent is doing as it happens.

### Event stream (WebSocket)

```
Session WebSocket: wss://s-{id}.paws.example.com/events

Events:
  { type: "agent_thinking", content: "Analyzing the codebase..." }
  { type: "tool_call", tool: "edit_file", args: { path: "src/settings.tsx", ... } }
  { type: "tool_result", tool: "edit_file", result: "ok" }
  { type: "file_changed", path: "src/settings.tsx", diff: "+  const [dark, setDark] = ..." }
  { type: "terminal_output", data: "✓ Compiled successfully" }
  { type: "agent_message", content: "I've added the dark mode toggle..." }
  { type: "pr_created", url: "https://github.com/org/repo/pull/42" }
  { type: "session_ending", reason: "mission_complete" }
```

The control plane relays events from the worker/agent to all connected dashboard clients. Multiple
developers can watch the same session (multiplayer, like Background Agents).

### How the agent runs

Inside the VM, the agent (Claude Code or similar) runs as a long-lived process. The worker
communicates with it via:

1. **SSH PTY** — worker SSHes into VM, starts the agent process, streams stdout/stderr
2. **Agent reports events** — agent writes structured events to stdout (or a local socket)
3. **Worker relays** — worker parses events and sends them to the control plane via the session
   WebSocket

When the developer sends a message in chat:

1. Dashboard → control plane WebSocket → worker
2. Worker writes the message to the agent's stdin (or a control socket)
3. Agent processes the message, continues working
4. Events stream back

---

## Session Types

### 1. Mission (collaborative, new)

The Eva/Devin model. Developer and agent collaborate until the task is shipped.

```yaml
# POST /v1/sessions
{
  'type': 'mission',
  'repo': 'org/repo',
  'branch': 'feat/dark-mode', # auto-created from base
  'prompt': 'Add dark mode to settings page',
  'expose': [3000, 3001], # ports to expose
  'daemon': 'fullstack-dev', # daemon config (tools, credentials)
  'timeout': '4h', # max session duration
}
```

- Long-lived (minutes to hours)
- Developer interacts via dashboard
- Agent runs as a persistent process
- Dev servers started automatically
- PR created when done
- VM destroyed on session close

### 2. Task (fire-and-forget, existing)

The Codex/Background Agents model. Already implemented.

```yaml
# POST /v1/sessions
{
  'type': 'task',
  'repo': 'org/repo',
  'prompt': 'Fix the flaky test in auth.test.ts',
  'daemon': 'test-fixer',
}
```

- Short-lived (seconds to minutes)
- No developer interaction
- Agent runs script, returns result
- VM destroyed immediately after

### 3. Daemon trigger (existing)

Event-driven. Webhook/cron triggers a session with the daemon's config.

```
GitHub webhook (PR opened) → trigger engine → session → agent reviews PR → VM destroyed
```

---

## Dev Server Auto-Detection

When a mission session starts, the worker can auto-detect the dev stack and start the right servers.
Pattern from Eva:

```typescript
// Check package.json for known frameworks
const pkg = JSON.parse(await ssh.readFile('/workspace/package.json'));
const scripts = pkg.scripts ?? {};
const devDeps = { ...pkg.dependencies, ...pkg.devDependencies };

if (devDeps['next']) return { cmd: 'npm run dev', port: 3000 };
if (devDeps['vite']) return { cmd: 'npm run dev', port: 5173 };
if (devDeps['nuxt']) return { cmd: 'npm run dev', port: 3000 };
if (devDeps['@angular/core']) return { cmd: 'npm start', port: 4200 };
if (scripts['dev']) return { cmd: 'npm run dev', port: 3000 };
if (scripts['start']) return { cmd: 'npm start', port: 3000 };
```

Or the daemon config can specify it explicitly:

```yaml
expose:
  - port: 3000
    label: 'Frontend'
    startCommand: 'cd frontend && npm run dev'
  - port: 3001
    label: 'API'
    startCommand: 'cd backend && npm run dev'
```

---

## Snapshot Strategy

Missions can be long-running. To handle interruptions (developer closes laptop, network drops),
we need snapshot support:

```
Mission paused (timeout or explicit):
  1. VM state saved (Firecracker snapshot: memory + disk + vmstate)
  2. Session marked as "paused" in gateway DB
  3. Preview URLs return "Session paused" page
  4. No resources consumed (VM is stopped)

Mission resumed:
  1. VM restored from pause snapshot (<1s)
  2. Dev servers resume (processes were in memory)
  3. Agent process resumes
  4. Preview URLs become live again
  5. HMR reconnects automatically

This is a Firecracker superpower — memory snapshots mean the entire process tree
(agent, dev servers, shell) freezes and resumes without restart.
```

---

## Relationship to Other Design Docs

| Doc                        | What it covers                                       | How this doc relates                                          |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `design-vm-exposure.md`    | Reverse proxy architecture, OIDC auth, port exposure | This doc builds on it — same proxy architecture, new UX layer |
| `design-mcp-gateway.md`    | agentgateway integration for MCP tools               | Missions use MCP tools (GitHub, Linear) via agentgateway      |
| `design-k8s-enterprise.md` | K8s-native deployment, no vendor lock-in             | Missions work the same in K8s and single-server               |
| `security.md`              | Zero-secret architecture, threat model               | Missions don't change the security model — same VM isolation  |

---

## Implementation Order

### Phase 1: Inbound port forwarding (prerequisite)

Build `design-vm-exposure.md` Phase 1:

- [ ] Control plane reverse proxy route (`/s/:sessionId/preview/:port/*`)
- [ ] Worker inbound proxy route (`/v1/sessions/:id/proxy/:port/*`)
- [ ] WebSocket upgrade support (HMR)
- [ ] Port readiness health check endpoint
- [ ] OIDC auth middleware (or session PIN for quick sharing)
- [ ] Wildcard TLS cert (cert-manager or manual)

### Phase 2: Mission session type

- [ ] New session type: `mission` (long-lived, interactive)
- [ ] Agent process management (start, stream events, accept input)
- [ ] Dev server auto-detection and startup
- [ ] Session event WebSocket (agent events → dashboard)
- [ ] Chat input → agent stdin relay

### Phase 3: Dashboard

- [ ] Split-pane layout (chat + sandbox tabs)
- [ ] Preview tab (iframe + port picker + readiness polling)
- [ ] Terminal tab (WebSocket PTY)
- [ ] Editor tab (code-server integration)
- [ ] Event stream display (tool calls, file changes, agent messages)
- [ ] Ship PR button
- [ ] End session button

### Phase 4: Session persistence

- [ ] Pause/resume via Firecracker memory snapshots
- [ ] Session state stored in gateway DB
- [ ] Resume from dashboard
- [ ] Auto-pause on inactivity timeout

### Phase 5: Polish

- [ ] Desktop tab (noVNC for browser-use sessions)
- [ ] Multiplayer (multiple developers watching same session)
- [ ] Session replay (recorded event stream for audit/review)
- [ ] File diff viewer in dashboard
- [ ] Screenshot capture for PR descriptions
