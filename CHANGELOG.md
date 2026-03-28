# Changelog

## [0.5.0.0] - 2026-03-28

First tagged release. paws is a working system: submit workloads, run in isolated Firecracker VMs, zero secrets in the sandbox.

### Added

- **Control plane** (formerly gateway) — spec-first Hono API, session dispatch, daemon registry, trigger engine, governance, OIDC auth, dashboard serving
- **Worker** — Firecracker VM executor, per-VM TLS MITM proxy, SSH into VMs, semaphore concurrency
- **Dashboard** — React SPA with fleet overview, session detail with WebSocket streaming, onboarding setup wizard
- **Onboarding wizard** — 3-screen setup flow (add server, add credentials, run first agent) with live terminal streaming
- **packages/credentials** — AES-256-GCM credential encryption with HKDF key derivation and key rotation
- **packages/provisioner** — Server provisioning state machine with SSH orchestration and PAWS_STAGE progress tracking
- **packages/firecracker** — VM lifecycle (create, restore, stop), networking (TAP, ip-pool, iptables), snapshot management
- **packages/proxy** — TLS MITM proxy for credential injection, domain allowlisting
- **packages/scheduler** — Least-loaded worker selection
- **packages/snapshot-store** — Cloudflare R2 snapshot distribution with integrity verification
- **packages/types** — Shared Zod schemas for sessions, daemons, workers, fleet, snapshots, WebSocket messages
- **packages/sdk** — TypeScript client for the paws API
- **providers/aws-ec2** — AWS EC2 host provider with waitForReady, createSecurityGroup, createKeyPair
- **providers/hetzner-cloud** — Hetzner Cloud host provider (control plane nodes)
- **providers/hetzner-dedicated** — Hetzner Robot API (bare metal workers)
- **Auto-scaling** — provision/drain worker nodes based on fleet utilization
- **Worker call-home** — workers auto-register via WebSocket with heartbeat
- **Prometheus metrics** — gateway + worker metrics export, VictoriaMetrics + Grafana dashboards
- **WebSocket streaming** — real-time session output
- **Multi-snapshot support** — different base images per workload type
- **OIDC auth with Dex** — GitHub SSO for dashboard
- **Caddy reverse proxy** — auto-HTTPS for fleet.tpops.dev
- **Control plane / worker split** — VPS + bare metal deployment architecture
- **Kubernetes manifests** — namespace, worker DaemonSet, control plane Deployment, RBAC
- **Docker images** — control plane + worker Dockerfiles with multi-stage builds
- **CI** — GitHub Actions for lint, typecheck, format check
- **Snapshot distribution** — R2 upload/download with worker sync loop
- **Bootstrap scripts** — install-firecracker.sh with structured progress markers, bootstrap-node.sh for full node setup
