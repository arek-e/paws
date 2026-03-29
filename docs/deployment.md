# Deployment Guide

```
 /\_/\
( o.o )  getting paws running
 > ^ <
```

## Architecture

paws runs as two components on separate servers:

```
┌─────────────────────────────────────┐
│         Control Plane (VPS)          │
│                                      │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ Gateway   │  │ Dashboard (React)│ │
│  │ (Hono API)│  │ (static files)   │ │
│  └──────────┘  └──────────────────┘ │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ Dex      │  │ SQLite state     │ │
│  │ (OIDC)   │  │ (sessions, etc.) │ │
│  └──────────┘  └──────────────────┘ │
│                                      │
│  Holds all credentials.              │
│  No /dev/kvm needed.                 │
│  Hetzner Cloud CX22: $4/mo          │
└──────────────┬──────────────────────┘
               │ HTTPS (worker calls home)
               │
┌──────────────┴──────────────────────┐
│       Worker Node (Bare Metal)       │
│                                      │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ Worker   │  │ Firecracker VMs  │ │
│  │ service  │  │ (per-session)    │ │
│  └──────────┘  └──────────────────┘ │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ Per-VM   │  │ Snapshot store   │ │
│  │ TLS proxy│  │ (local cache)    │ │
│  └──────────┘  └──────────────────┘ │
│                                      │
│  Zero secrets. Just runs VMs.        │
│  Needs /dev/kvm + root.              │
│  Hetzner AX42: ~$48/mo              │
└─────────────────────────────────────┘
```

### Why separate?

|                    | Control Plane                      | Worker Node              |
| ------------------ | ---------------------------------- | ------------------------ |
| **Purpose**        | API, auth, credentials, scheduling | Run Firecracker VMs      |
| **Needs /dev/kvm** | No                                 | Yes                      |
| **Needs root**     | No                                 | Yes                      |
| **Holds secrets**  | Yes (all API keys, tokens)         | No (zero-trust)          |
| **Server type**    | Cheap VPS ($4-10/mo)               | Bare metal with KVM      |
| **Scales by**      | Not needed (single instance)       | Adding more worker nodes |

## Quick Start (Single Server)

For development or small deployments, run everything on one server:

```bash
# Install
git clone https://github.com/arek-e/paws
cd paws
bun install

# Start (gateway + worker on same machine)
bun run start
```

Gateway on `:4000`, worker on `:3000`. Dashboard at `http://localhost:4000`.

## Production Setup

### 1. Provision the Control Plane (VPS)

Any VPS with 2+ vCPUs and 2GB+ RAM. No special requirements.

**Hetzner Cloud CX22** ($4/mo) or **CX32** ($8/mo) recommended.

```bash
# On the control plane VPS:
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/arek-e/paws /opt/paws
cd /opt/paws
bun install

# Build the dashboard
cd apps/dashboard && bunx vite build && cd ../..

# Generate an API key
export API_KEY=$(openssl rand -hex 16)
echo "Your API key: $API_KEY"

# Start the gateway
DASHBOARD_DIR=apps/dashboard/dist \
API_KEY=$API_KEY \
PORT=4000 \
bun run apps/control-plane/src/server.ts
```

#### With OIDC (optional)

```bash
# Install Docker for Dex
apt install -y docker.io docker-compose-v2

# Start Dex
cd /opt/paws/infra/dex
GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=xxx \
docker compose up -d

# Start gateway with OIDC
OIDC_ISSUER=http://localhost:5556/dex \
OIDC_CLIENT_ID=paws-control-plane \
OIDC_CLIENT_SECRET=paws-dex-secret-changeme \
AUTH_SECRET=$(openssl rand -hex 32) \
DASHBOARD_DIR=apps/dashboard/dist \
API_KEY=$API_KEY \
PORT=4000 \
bun run apps/control-plane/src/server.ts
```

#### Expose with Cloudflare Tunnel

```bash
# Install cloudflared
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Create tunnel
cloudflared tunnel login
cloudflared tunnel create paws
cloudflared tunnel route dns paws fleet.yourdomain.com

# Run tunnel (add to systemd for persistence)
cloudflared tunnel run paws
```

#### Systemd service

```bash
cat > /etc/systemd/system/paws-control-plane.service << 'EOF'
[Unit]
Description=paws gateway (control plane)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/paws
Environment=PORT=4000
Environment=DASHBOARD_DIR=apps/dashboard/dist
EnvironmentFile=/opt/paws/.env
ExecStart=/usr/local/bin/bun run apps/control-plane/src/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Create .env with your secrets
cat > /opt/paws/.env << EOF
API_KEY=your-api-key-here
# OIDC (optional)
# OIDC_ISSUER=http://localhost:5556/dex
# OIDC_CLIENT_ID=paws-control-plane
# OIDC_CLIENT_SECRET=paws-dex-secret-changeme
# AUTH_SECRET=$(openssl rand -hex 32)
EOF
chmod 600 /opt/paws/.env

systemctl enable paws-control-plane
systemctl start paws-control-plane
```

### 2. Provision Worker Nodes (Bare Metal)

Any Linux server with `/dev/kvm` and root access. Needs:

- KVM support (bare metal or nested virt)
- 4+ GB RAM per concurrent VM
- NVMe storage recommended (snapshot restore speed)

**Hetzner AX42** (~$48/mo) or **EC2 c5.xlarge spot** (~$50/mo) recommended.

```bash
# On the worker node:
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/arek-e/paws /opt/paws
cd /opt/paws
bun install

# Install Firecracker
sudo scripts/install-firecracker.sh

# Start the worker
GATEWAY_URL=https://fleet.yourdomain.com \
PORT=3000 \
bun run apps/worker/src/server.ts
```

The gateway discovers workers via the `WORKER_URL` env var or K8s pod watching. For manual setup, set `WORKER_URL` on the gateway:

```bash
# On the control plane, restart gateway with worker URL
WORKER_URL=http://<worker-ip>:3000 \
# ... other env vars ...
bun run apps/control-plane/src/server.ts
```

#### Systemd service

```bash
cat > /etc/systemd/system/paws-worker.service << 'EOF'
[Unit]
Description=paws worker (VM execution)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/paws
Environment=PORT=3000
Environment=MAX_CONCURRENT_VMS=5
Environment=SNAPSHOT_DIR=/var/lib/paws/snapshots/agent-latest
ExecStart=/usr/local/bin/bun run apps/worker/src/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl enable paws-worker
systemctl start paws-worker
```

### 3. Add More Workers

Just repeat step 2 on a new server. Update the gateway's `WORKER_URL` to include all workers (comma-separated), or use K8s discovery if running in a cluster.

## Environment Variables

### Control Plane (Gateway)

| Variable             | Required | Default        | Description                                |
| -------------------- | -------- | -------------- | ------------------------------------------ |
| `PORT`               | No       | `4000`         | Gateway listen port                        |
| `API_KEY`            | Yes      | `paws-dev-key` | API key for SDK/CLI auth                   |
| `WORKER_URL`         | No       | —              | Worker URL(s) for static discovery         |
| `DASHBOARD_DIR`      | No       | —              | Path to dashboard dist/ for static serving |
| `OIDC_ISSUER`        | No       | —              | OIDC provider URL (enables SSO)            |
| `OIDC_CLIENT_ID`     | No       | —              | OIDC client ID                             |
| `OIDC_CLIENT_SECRET` | No       | —              | OIDC client secret                         |
| `AUTH_SECRET`        | No       | —              | Session cookie signing key (32+ chars)     |

### Worker Node

| Variable             | Required | Default                                | Description                  |
| -------------------- | -------- | -------------------------------------- | ---------------------------- |
| `PORT`               | No       | `3000`                                 | Worker listen port           |
| `MAX_CONCURRENT_VMS` | No       | `5`                                    | Max parallel Firecracker VMs |
| `MAX_QUEUE_SIZE`     | No       | `10`                                   | Max queued sessions          |
| `SNAPSHOT_DIR`       | No       | `/var/lib/paws/snapshots/agent-latest` | Path to VM snapshot          |
| `VM_BASE_DIR`        | No       | `/var/lib/paws/vms`                    | Working directory for VMs    |
| `SSH_KEY_PATH`       | No       | `/var/lib/paws/ssh/id_ed25519`         | SSH key for VM access        |

## Kubernetes (Alternative)

K8s manifests are available at `infra/k8s/` for teams that prefer Kubernetes. See `docs/architecture.md` for details. The worker DaemonSet requires `hostNetwork`, `hostPID`, and `privileged` mode.

## Snapshot Management

Workers need a VM snapshot to run sessions. On first setup:

```bash
# Build a snapshot (on a machine with /dev/kvm)
sudo scripts/build-snapshot.sh snapshot-configs/agent-latest.yaml

# Upload to R2 for distribution
bun run scripts/upload-snapshot.ts agent-latest /var/lib/paws/snapshots/agent-latest
```

Workers with R2 credentials configured will sync snapshots automatically via the sync loop.

## Administration

### Reset Admin Password

If you forget the admin password, reset it from the server:

```bash
# Docker
docker exec -it paws-control-plane bun run reset-password

# Kubernetes
kubectl exec -it deploy/control-plane -- bun run reset-password

# Bare metal / systemd
cd /opt/paws && bun run reset-password --filter @paws/control-plane
```

This generates a random password, updates the admin account in SQLite, invalidates all existing
sessions, and prints the new password to stdout. The admin can then log in at the dashboard with
the new password.

The script requires access to the control plane's data directory (`DATA_DIR`, defaults to
`/var/lib/paws/data`). It reads and writes to `paws.db` directly.
