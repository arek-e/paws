# Changelog

## [0.5.2.0] - 2026-03-29

### Added

- **Claude Code agent harness** — `agent` field in daemon config auto-generates workload scripts. Just provide a prompt, framework, and constraints.
- **Pangolin admin dashboard** — Tunnels page with 4 tabs: active tunnels, sites, users, SSO. Manage Pangolin entirely from the paws dashboard.
- **Per-port access control** — SSO (default), PIN, or email whitelist per exposed port. Every port also gets a time-limited shareable link.
- **Unified SSO** — Pangolin auto-registers Dex as OIDC provider on startup. Single login for dashboard and tunnel URLs.
- **One-line installer** — `curl | bash` like Coolify/Dokploy. Installs Docker, generates secrets, starts everything. Works on bare IP without a domain.
- **No Cloudflare required** — TLS via HTTP-01 challenge. Domain and DNS configured after install, not before.
- **Label-based subdomains** — `s-abc-frontend.fleet.dev` instead of `s-abc-3000.fleet.dev`. 12 hex chars for collision safety to ~420k concurrent sessions.
- **Forwarded headers** — Pangolin passes `Remote-User`, `Remote-Email`, `Remote-Name` to apps inside VMs when using SSO auth.
- **paws acronym** — Protected Agent Workspace Sandboxes.

### Changed

- Pangolin resource API aligned with real two-step flow (PUT resource + PUT target)
- Port pool validates range on release to prevent corruption

## [0.5.1.0] - 2026-03-29

### Added

- **Port exposure** — VMs can expose ports via Pangolin tunnels, giving agents public URLs for running dev servers (Next.js, Docker Compose, etc.)
- **Snapshot configuration** — API + dashboard for managing snapshot configs with built-in templates (minimal, node, python, docker, fullstack, claude-code)
- **Worker build endpoint** — POST /v1/snapshots/{id}/build runs setup script in VM, saves snapshot
- **Control plane exposed ports polling** — GET /v1/sessions/{id} surfaces tunnel URLs from workers
- **Auto-merge required domains** — Snapshot requiredDomains merged into proxy allowlist before dispatch

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
