# K8s-Native Enterprise Architecture — Design Doc

```
 /\_/\
( o.o )  enterprise cats in clusters
 > ^ <
```

## Problem

paws needs to scale for enterprise customers who want:

1. **K8s-native deployment** — `helm install paws`, not SSH and systemd
2. **Multi-node worker fleet** — scale by adding nodes, not reconfiguring
3. **MCP gateway** — agents need to call MCP tool servers without holding tokens
4. **No vendor lock-in** — no SaaS dependencies, no CNI requirements, works on any K8s cluster

**Constraint: paws must work on any customer's existing K8s cluster.** We cannot require a specific
CNI (Cilium, Calico), service mesh (Istio), or SaaS service (Tailscale). The customer runs
`helm install paws` and it works alongside whatever they already have.

---

## Key Architectural Decisions

### 1. The per-VM proxy IS the egress controller — no CNI-level solution

We originally considered Cilium for L3/L4 FQDN-based egress enforcement. **This is wrong.** Cilium
requires replacing the cluster's CNI — a non-starter for enterprise customers with existing
networking stacks.

But we don't need it. The existing per-VM architecture already provides airtight egress control:

```
VM (172.16.x.2)
  │
  │  ALL traffic (any port, any protocol)
  │
  ├─ iptables DNAT: ports 80/443 → per-VM MITM proxy (172.16.x.1:8443)
  ├─ iptables FORWARD: allow only traffic to proxy IP
  ├─ iptables DROP: everything else (inter-VM, metadata, internet)
  │
  └─ MITM proxy checks domain allowlist
      ├─ Allowed + has credentials → inject headers, forward
      ├─ Allowed + no credentials → forward as-is
      └─ Not allowed → TCP RST (connection refused)
```

**There is no bypass path.** The VM's only network interface is a TAP device. All traffic goes
through iptables rules that paws controls. Even if an attacker gets root in the VM, they cannot
reach any destination that isn't in the allowlist — the enforcement happens on the HOST, not in
the VM.

This works on any K8s cluster regardless of CNI because the security boundary is at the TAP/iptables
layer, which is below the CNI. Worker pods run `hostNetwork: true` and manage their own network
stack. The CNI is irrelevant.

**What we do for K8s hardening:** A simple `NetworkPolicy` (IP/CIDR-based, supported by every CNI)
on worker pods to restrict worker-to-cluster traffic. Workers only need to reach:

- Control plane service (ClusterIP)
- DNS (kube-dns)
- Internet (for upstream API forwarding)

This is basic and works everywhere. No FQDN policies needed at the K8s layer.

### 2. No tunneling needed in-cluster — K8s Services handle it

In a K8s deployment, control plane and workers are pods in the same cluster. Standard K8s networking
handles everything:

```
gateway.paws.svc.cluster.local:4000  ←→  worker.paws.svc.cluster.local:3000
```

No Pangolin. No WireGuard. No Tailscale. Just ClusterIP services.

For **remote bare-metal workers** that can't join the K8s cluster (edge locations, customer-owned
hardware with /dev/kvm), we keep the WebSocket call-home as a fallback — already implemented in
`apps/control-plane/src/routes/worker-ws.ts`.

### 3. agentgateway for MCP — external dep is justified

MCP protocol handling is structurally more complex than HTTP credential injection:

- JSON-RPC 2.0 dispatch + capability negotiation
- Tool discovery aggregation across multiple backends
- Streaming responses (SSE, streamable-HTTP transports)
- CEL-based per-tool authorization policies
- Spec is still evolving (new transports, capabilities)

Building this in-house would be ~1500+ lines of TypeScript, no CEL engine, and ongoing spec tracking.
agentgateway (Apache 2.0, Linux Foundation, Rust) solves all of this and ships as a Helm subchart.
Enterprise customers never install it separately — it's an implementation detail bundled in the paws
chart.

The HTTP/HTTPS proxy stays hand-rolled. It's ~400 lines, deeply integrated with TAP/iptables, and
the problem it solves is simple and stable.

### 4. Envoy Gateway for external ingress — Gateway API standard

K8s Ingress is retired (read-only archive since March 2026). Gateway API is the successor.

**Envoy Gateway** (Apache 2.0, CNCF graduated lineage, highest Gateway API conformance) exposes the
control plane API and dashboard externally. But we make it OPTIONAL — if a customer already has an
ingress controller, they can use their own. The Helm chart defaults to Envoy Gateway but can be
disabled.

---

## Previous State (before Pangolin removal)

> **Note:** Phase 1 (Pangolin removal) is complete. See git history for the old architecture.
> Workers now connect via K8s Services (in-cluster) or WebSocket call-home (remote).

```
┌─ Control Plane VPS ──────────────────────────────┐
│                                                    │
│  Gateway (Hono :4000)                              │
│  ├── API + OpenAPI spec                            │
│  ├── Trigger engine (webhook, cron, watch)         │
│  ├── Session tracker + Daemon registry             │
│  ├── LLM history store                             │
│  ├── Governance (rate limits, approval gates)      │
│  └── Worker discovery: K8s pod watcher (primary)   │
│                         WebSocket call-home (remote)│
│                                                    │
└──────────────────┬─────────────────────────────────┘
                   │ K8s Service / WebSocket
┌──────────────────┴─────────────────────────────────┐
│ Worker (Bare Metal)                                 │
│                                                     │
│  Worker Service (Hono :3000)                        │
│  ├── Session executor (VM lifecycle)                │
│  ├── Per-VM TLS MITM proxy                          │
│  └── TAP devices + iptables                         │
│                                                     │
│  Firecracker VMs (no secrets, no bypass path)       │
└─────────────────────────────────────────────────────┘
```

---

## Target Architecture

```
┌──────────────────────────── K8s Cluster ─────────────────────────────┐
│  (any CNI — Calico, Flannel, Cilium, cloud-managed, doesn't matter) │
│                                                                       │
│  ┌──────────── Gateway (Deployment) ──────────────────────────┐      │
│  │                                                             │      │
│  │  Control Plane (Hono :4000)                                 │      │
│  │  ├── API + OpenAPI spec                                     │      │
│  │  ├── Trigger engine (webhook, cron, watch)                  │      │
│  │  ├── Session tracker + Daemon registry                      │      │
│  │  ├── LLM history store (SQLite → Postgres for HA)           │      │
│  │  ├── Governance (rate limits, approval gates, audit log)    │      │
│  │  ├── Worker discovery: K8s pod watcher (primary)            │      │
│  │  │                     WebSocket call-home (remote workers) │      │
│  │  └── Reverse proxy for VM port exposure                     │      │
│  │                                                             │      │
│  │  Security: non-root, no caps, ClusterIP service             │      │
│  │  Scaling: stateless → replicas: N behind Service            │      │
│  │                                                             │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                              │                                        │
│                    ClusterIP Service :4000                            │
│                              │                                        │
│  ┌───────────────── Worker Nodes (bare metal, /dev/kvm) ──────┐      │
│  │                                                             │      │
│  │  ┌─── Worker Pod (DaemonSet) ──────────────────────────┐   │      │
│  │  │                                                      │   │      │
│  │  │  Worker (Hono :3000)         hostNetwork: true       │   │      │
│  │  │  ├── Session executor        privileged: true        │   │      │
│  │  │  ├── Per-VM MITM proxy       /dev/kvm mounted        │   │      │
│  │  │  └── TAP + iptables                                  │   │      │
│  │  │                                                      │   │      │
│  │  │  agentgateway (sidecar)      ◄── MCP protocol        │   │      │
│  │  │  ├── MCP routing + auth      Apache 2.0, Rust        │   │      │
│  │  │  ├── Tool-level CEL policies Helm subchart            │   │      │
│  │  │  ├── Credential injection    Shared per worker        │   │      │
│  │  │  └── Session isolation       URL prefix routing       │   │      │
│  │  │                                                      │   │      │
│  │  │  ┌── Firecracker VM ────────────────────────────┐    │   │      │
│  │  │  │                                               │    │   │      │
│  │  │  │  Agent (zero secrets)                         │    │   │      │
│  │  │  │                                               │    │   │      │
│  │  │  │  HTTPS → iptables DNAT → MITM proxy (host)   │    │   │      │
│  │  │  │  MCP   → iptables DNAT → proxy → agentgateway│    │   │      │
│  │  │  │  Other → iptables DROP (no bypass possible)   │    │   │      │
│  │  │  │                                               │    │   │      │
│  │  │  └───────────────────────────────────────────────┘    │   │      │
│  │  │                                                      │   │      │
│  │  └──────────────────────────────────────────────────────┘   │      │
│  │                                                             │      │
│  │  ┌─── Worker Pod (DaemonSet) ──── Node 2 ─────────────┐   │      │
│  │  │  (same as above)                                     │   │      │
│  │  └──────────────────────────────────────────────────────┘   │      │
│  │                                                             │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
│  ┌── Optional: Envoy Gateway (or customer's own ingress) ────┐      │
│  │  Exposes gateway API + dashboard externally                 │      │
│  │  Gateway API CRDs (HTTPRoute, etc.)                         │      │
│  │  Disabled if customer provides their own ingress             │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
│  ┌── NetworkPolicy (works with ANY CNI) ──────────────────────┐      │
│  │  Worker pods: allow → control-plane, kube-dns, internet     │      │
│  │  Worker pods: deny → other namespaces, metadata endpoint    │      │
│  │  Gateway pods: allow → workers, kube-dns, internet          │      │
│  │  (IP/CIDR-based only — no FQDN needed at this layer)       │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

  Optional: Remote bare-metal workers (not in K8s)
  ┌─────────────────────────────────────────────────┐
  │  Worker (systemd service)                        │
  │  ├── WebSocket call-home → gateway               │
  │  ├── Same VM lifecycle, same proxy, same security│
  │  └── No K8s needed, just /dev/kvm + network      │
  └─────────────────────────────────────────────────┘
```

---

## Security Model (unchanged, CNI-independent)

The entire security model operates BELOW the K8s networking layer. It doesn't matter what CNI the
customer uses because VM network isolation is enforced by TAP devices and iptables on the host.

```
┌─────────────────────────────────────────────────────────────────┐
│ SECURITY BOUNDARY: Host-level (TAP + iptables + MITM proxy)    │
│                                                                  │
│ This is where secrets live and access control is enforced.       │
│ Everything below this line (the VM) has zero secrets.            │
│                                                                  │
│  ┌─ Per-VM MITM Proxy (on host) ──────────────────────────┐    │
│  │                                                         │    │
│  │  HTTPS traffic:                                         │    │
│  │  ├─ Domain in allowlist + has credentials?              │    │
│  │  │   → TLS terminate, inject auth headers, forward      │    │
│  │  ├─ Domain in allowlist, no credentials?                │    │
│  │  │   → TLS terminate, forward as-is                     │    │
│  │  └─ Domain NOT in allowlist?                            │    │
│  │      → TCP RST (connection refused)                     │    │
│  │                                                         │    │
│  │  MCP traffic (via agentgateway):                        │    │
│  │  ├─ Session token valid?                                │    │
│  │  ├─ Tool allowed by CEL policy?                         │    │
│  │  │   → Inject backend credentials, forward to MCP server│    │
│  │  └─ Tool NOT allowed?                                   │    │
│  │      → 403 Forbidden                                    │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Per-VM iptables (on host) ────────────────────────────┐    │
│  │  DNAT: TCP 80/443 → proxy (172.16.x.1:8443)           │    │
│  │  ALLOW: traffic to proxy IP only                        │    │
│  │  DROP: inter-VM traffic                                 │    │
│  │  DROP: metadata endpoint (169.254.169.254)              │    │
│  │  DROP: everything else                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ VM (zero secrets, no bypass path)                                │
│                                                                  │
│  Agent receives only: SESSION_TOKEN, GATEWAY_URL, GATEWAY_MCP_URL│
│  Agent does NOT receive: any API keys, tokens, or secrets        │
│  Agent's only network path: TAP → iptables → proxy              │
│                                                                  │
│  Even with root access in the VM, an attacker cannot:            │
│  ├─ Reach the internet directly (iptables DROP)                  │
│  ├─ Reach other VMs (iptables DROP)                              │
│  ├─ Reach the K8s API (iptables DROP)                            │
│  ├─ Reach cloud metadata (iptables DROP)                         │
│  ├─ Reach non-allowlisted domains (proxy RST)                   │
│  └─ Read credentials (they exist only in proxy memory on host)  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Why we don't need Cilium/Istio/any CNI-level solution:** The security enforcement happens at the
TAP device boundary, not the pod boundary. The CNI manages pod-to-pod networking. But VM traffic
never touches the CNI — it goes through a dedicated TAP device that iptables routes to the proxy.
Two completely independent network stacks.

---

## MCP Gateway — agentgateway Integration

### Request Flow

```
Agent in VM
  │
  │ POST https://mcp.internal/tools/call
  │ Body: {"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_pr",...}}
  │ Header: X-Session-Token: sess_abc123
  │
  ├─ iptables DNAT → MITM proxy (172.16.x.1:8443)
  │
  ├─ MITM proxy: mcp.internal is in allowlist
  │   └─ Forward to agentgateway (localhost:4317)
  │
  ├─ agentgateway:
  │   ├─ Validate session token (sess_abc123)
  │   ├─ Route to session's MCP config (/abc123/*)
  │   ├─ Tool "create_pr" → backend: GitHub MCP server
  │   ├─ CEL policy check: daemon allows create_pr? YES
  │   ├─ Inject: Authorization: Bearer ghp_... (from session config)
  │   └─ Forward to real GitHub MCP server
  │
  └─ Response: agentgateway → MITM proxy → iptables → VM
```

### Session Lifecycle

```
Session start:
  1. Gateway tells worker: "start session abc123 for daemon X"
  2. Worker fetches daemon's MCP config from gateway:
     - Which MCP servers (GitHub, Linear, etc.)
     - Which tools allowed per server
     - Credentials per server
  3. Worker writes session config to agentgateway (file or XDS API)
  4. agentgateway hot-reloads: route /abc123/* now active
  5. Worker boots VM with GATEWAY_MCP_URL=https://mcp.internal:4317/abc123

Session end:
  1. Worker removes session config from agentgateway
  2. Route /abc123/* torn down
  3. VM destroyed, proxy killed, TAP cleaned up
```

### Deployment

agentgateway runs as a sidecar container in the worker DaemonSet pod (shares the pod's network
namespace, which is the host network):

```yaml
# Inside worker DaemonSet pod spec
containers:
  - name: worker
    image: ghcr.io/arek-e/paws-worker:latest
    # ... (existing config)

  - name: agentgateway
    image: ghcr.io/agentgateway/agentgateway:latest
    ports:
      - containerPort: 4317
        name: mcp
    volumeMounts:
      - name: mcp-config
        mountPath: /etc/agentgateway/
    resources:
      requests: { cpu: 100m, memory: 64Mi }
      limits: { cpu: 500m, memory: 256Mi }

volumes:
  - name: mcp-config
    emptyDir: {} # worker writes session configs here
```

Worker writes session YAML files to the shared volume. agentgateway watches and hot-reloads.

---

## External Access (Gateway API)

For exposing the paws API and dashboard externally, the Helm chart includes an OPTIONAL Envoy
Gateway setup:

```yaml
# values.yaml
ingress:
  enabled: true # set false if customer has their own ingress
  className: envoy # or nginx, traefik, etc.
  host: paws.example.com
  tls:
    enabled: true
    secretName: paws-tls # customer provides their cert, or use cert-manager
```

If `ingress.enabled: false`, the customer uses their own ingress controller with a simple HTTPRoute
or Ingress resource pointing to the gateway ClusterIP service.

---

## Multi-Cluster / Remote Workers

### Same cluster (default, simplest)

```
K8s cluster:
  Gateway (Deployment) ←→ Workers (DaemonSet)
  Connected via: ClusterIP Services (standard K8s networking)
  No tunneling, no VPN, no extra components.
```

### Remote bare-metal workers (edge, customer hardware)

For workers that can't join the K8s cluster (e.g., GPU servers in a different datacenter):

```
K8s cluster:                     Remote server:
  Gateway ◄─── WebSocket ───── Worker (systemd)
           call-home connection
           (worker initiates)
```

The WebSocket call-home is already implemented (`apps/control-plane/src/routes/worker-ws.ts`).
The remote worker connects outbound to the gateway — no inbound ports needed, works through NAT
and firewalls.

For encrypted transport: the WebSocket runs over TLS (wss://). No VPN required.

### Multi-cluster (future, v0.3+)

If workers run in a different K8s cluster:

| Option              | License        | Requires                        | Best for                                 |
| ------------------- | -------------- | ------------------------------- | ---------------------------------------- |
| WebSocket call-home | N/A (built-in) | Gateway reachable over internet | Simple, works anywhere                   |
| Plain WireGuard     | GPLv2          | Manual config                   | 2-3 clusters, full control               |
| Headscale           | BSD-3          | Self-hosted server              | Many clusters, Tailscale UX without SaaS |
| Cilium Cluster Mesh | Apache 2.0     | Cilium on all clusters          | If customer already uses Cilium          |

**Default recommendation:** WebSocket call-home. Zero infrastructure. Worker connects to gateway
URL, registers itself, receives session requests. Works on any network.

---

## Helm Chart Structure

```
charts/paws/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── namespace.yaml
│   ├── rbac/
│   │   ├── serviceaccount.yaml
│   │   └── clusterrole.yaml
│   ├── gateway/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   └── secret.yaml
│   ├── worker/
│   │   ├── daemonset.yaml          # includes agentgateway sidecar
│   │   ├── service.yaml
│   │   └── configmap.yaml
│   ├── networkpolicy.yaml          # basic CIDR-based, works with any CNI
│   └── ingress/
│       ├── gateway-api.yaml        # if ingress.enabled && ingress.type=gateway-api
│       └── ingress.yaml            # if ingress.enabled && ingress.type=ingress
├── charts/
│   └── agentgateway/               # subchart dependency
└── README.md
```

### Minimal install

```bash
helm install paws oci://ghcr.io/arek-e/charts/paws \
  --set gateway.apiKey=your-api-key \
  --set ingress.host=paws.example.com
```

### What the customer needs

- K8s cluster (any version >= 1.28, any CNI)
- At least one node with `/dev/kvm` (bare metal or nested virt enabled)
- Firecracker binary on worker nodes (`/usr/local/bin/firecracker`)
- VM snapshots on worker nodes (`/var/lib/paws/snapshots/`)

### What the customer does NOT need

- Specific CNI (Cilium, Calico, etc.) — any CNI works
- Service mesh (Istio, Linkerd) — not required
- SaaS accounts (Tailscale, Cloudflare, etc.) — fully self-hosted
- Specific ingress controller — bring your own or use the bundled Envoy Gateway

---

## Migration Plan

### Phase 1: Remove Pangolin -- DONE

- [x] Remove `apps/control-plane/src/discovery/pangolin.ts`
- [x] Remove `apps/worker/src/tunnel/pangolin-resources.ts`
- [x] Remove Pangolin/Gerbil/Traefik from docker-compose.yml
- [x] K8s pod watcher becomes primary discovery
- [x] WebSocket call-home stays as fallback for remote workers
- [x] Update docs

### Phase 2: MCP Gateway (agentgateway)

- [ ] Deploy agentgateway on staging (standalone, manual config test)
- [ ] Build config generator in worker (session → agentgateway YAML)
- [ ] Wire session start/stop to write/remove config
- [ ] Inject `GATEWAY_MCP_URL` into VM env
- [ ] Update control plane MCP routes (remove 501 stubs)
- [ ] End-to-end test: agent in VM calls GitHub MCP tools
- [ ] Add CEL policy generation from daemon config

### Phase 3: Control Plane Reverse Proxy (VM port exposure)

- [ ] Implement per `docs/design-vm-exposure.md`
- [ ] Control plane reverse proxy for port exposure
- [ ] Session-scoped URLs, OIDC auth
- [ ] WebSocket support (noVNC, HMR)

### Phase 4: Helm Chart

- [ ] Package all K8s manifests as Helm chart
- [ ] agentgateway as subchart dependency
- [ ] NetworkPolicy templates (CIDR-based, CNI-agnostic)
- [ ] Optional Envoy Gateway / Ingress templates
- [ ] Values: worker count, resource limits, API key, ingress config
- [ ] Test: `helm install paws` on fresh cluster works end-to-end

### Phase 5: Production Hardening

- [ ] Gateway HA: SQLite → Postgres, replicas > 1
- [ ] Snapshot distribution: R2/S3 sync to worker nodes
- [ ] Monitoring: Prometheus metrics + Grafana dashboards in chart
- [ ] RBAC: least-privilege service accounts

---

## Decisions Log

| Decision       | Choice                                 | Rejected                       | Why                                                                                                                                     |
| -------------- | -------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Egress control | Per-VM proxy + iptables (existing)     | Cilium, Istio, Calico          | CNI replacement is non-starter for enterprise. Our proxy already does FQDN allowlisting at L7. iptables enforces at L3. No bypass path. |
| MCP gateway    | agentgateway (Apache 2.0, subchart)    | Hand-roll, Envoy AI Gateway    | Purpose-built for MCP, CEL policies, spec tracking. Hand-roll would be 1500+ lines + ongoing maintenance. Envoy is overkill.            |
| Ingress        | Envoy Gateway (optional)               | Require specific ingress       | Customer may already have ingress. Make it optional.                                                                                    |
| Tunneling      | None (in-cluster) / WebSocket (remote) | Pangolin, Tailscale, Headscale | In-cluster needs nothing. Remote workers use outbound WebSocket — zero infra required.                                                  |
| Encryption     | K8s-native (TLS on services)           | Service mesh mTLS              | Internal traffic is control-plane ↔ worker over ClusterIP. TLS on the Hono servers is sufficient. No mesh needed.                       |
| NetworkPolicy  | Basic CIDR (works with any CNI)        | FQDN-based (Cilium-only)       | FQDN enforcement happens at the proxy layer, not the CNI layer. CIDR-based NetworkPolicy is universally supported.                      |

---

## Open Questions

1. **agentgateway config mechanism** — file-based (worker writes YAML, agentgateway watches) vs
   XDS API (worker pushes config via gRPC). File-based is simpler for v1. XDS is better for
   high-throughput session creation. Start with file, migrate to XDS if needed.

2. **Gateway HA** — SQLite works for single-replica. For HA (replicas > 1), need shared storage
   (Postgres, or SQLite on a shared PV with WAL mode). Postgres is the cleaner path. When?

3. **Snapshot distribution** — workers need VM snapshots on local disk. For multi-node, snapshots
   need syncing. Options: R2/S3 pull on node start, or baked into a node image. The snapshot-store
   package already supports R2.

4. **Custom operator (v1.0+)** — the current model (privileged DaemonSet) works but isn't K8s-
   idiomatic. A `PawsSession` CRD with a custom operator would let sessions be first-class K8s
   resources. Significant engineering effort. Worth it?
