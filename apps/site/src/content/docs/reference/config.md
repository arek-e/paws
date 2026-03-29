---
title: Configuration Reference
description: Environment variables for the paws control plane and worker.
---

Both services are configured via environment variables. Set them in your shell, a `.env` file, or your Docker/Kubernetes manifests.

## Control plane

The control plane runs on any VPS. It serves the API, dashboard, and coordinates workers.

### Core

| Variable        | Default              | Description                                                           |
| --------------- | -------------------- | --------------------------------------------------------------------- |
| `PORT`          | `4000`               | HTTP listen port                                                      |
| `API_KEY`       | `paws-dev-key`       | API key for authenticating requests                                   |
| `WORKER_URL`    | --                   | Static worker URL for dev/single-node (e.g., `http://localhost:3000`) |
| `DASHBOARD_DIR` | --                   | Path to built dashboard assets (enables web UI)                       |
| `DATA_DIR`      | `/var/lib/paws/data` | Persistent data directory (daemon store)                              |

### Pangolin (worker discovery)

Set these to discover workers via Pangolin WireGuard tunnels:

| Variable            | Default | Description                                      |
| ------------------- | ------- | ------------------------------------------------ |
| `PANGOLIN_API_URL`  | --      | Pangolin API base URL                            |
| `PANGOLIN_ORG_ID`   | --      | Pangolin organization ID                         |
| `PANGOLIN_API_KEY`  | --      | Pangolin API key (alternative to email/password) |
| `PANGOLIN_EMAIL`    | --      | Pangolin admin email (alternative to API key)    |
| `PANGOLIN_PASSWORD` | --      | Pangolin admin password                          |

You need either `PANGOLIN_API_KEY` or both `PANGOLIN_EMAIL` + `PANGOLIN_PASSWORD`.

### OIDC authentication

Set all four to enable SSO login on the dashboard and API:

| Variable                 | Default                                 | Description                                                |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| `OIDC_ISSUER`            | --                                      | OIDC issuer URL (e.g., `https://fleet.example.com/dex`)    |
| `OIDC_CLIENT_ID`         | --                                      | OIDC client ID                                             |
| `OIDC_CLIENT_SECRET`     | --                                      | OIDC client secret                                         |
| `AUTH_SECRET`            | --                                      | Secret for signing session cookies                         |
| `OIDC_REDIRECT_URI`      | `http://localhost:{PORT}/auth/callback` | OAuth callback URL                                         |
| `OIDC_AUTH_EXTERNAL_URL` | --                                      | External-facing URL for auth redirects (if behind a proxy) |

### Pangolin OIDC bridge

Auto-registers Dex as an identity provider in Pangolin (for port exposure SSO):

| Variable               | Default | Description                                            |
| ---------------------- | ------- | ------------------------------------------------------ |
| `PANGOLIN_OIDC_SECRET` | --      | Client secret for Pangolin's OIDC integration with Dex |

### Autoscaler

| Variable                  | Default         | Description                                                |
| ------------------------- | --------------- | ---------------------------------------------------------- |
| `AUTOSCALE_ENABLED`       | `false`         | Enable auto-scaling                                        |
| `AUTOSCALE_PROVIDER`      | `hetzner-cloud` | Provider for new workers (`hetzner-cloud`, `aws-ec2`)      |
| `AUTOSCALE_MIN_WORKERS`   | `1`             | Minimum worker count                                       |
| `AUTOSCALE_MAX_WORKERS`   | `10`            | Maximum worker count                                       |
| `AUTOSCALE_WORKER_PLAN`   | `cx31`          | Server type for new workers                                |
| `AUTOSCALE_WORKER_REGION` | `fsn1`          | Region for new workers                                     |
| `HCLOUD_TOKEN`            | --              | Hetzner Cloud API token (when provider is `hetzner-cloud`) |
| `AWS_REGION`              | `us-east-1`     | AWS region (when provider is `aws-ec2`)                    |
| `AWS_AMI_ID`              | --              | AMI ID for worker instances                                |
| `AWS_ACCESS_KEY_ID`       | --              | AWS access key                                             |
| `AWS_SECRET_ACCESS_KEY`   | --              | AWS secret key                                             |

---

## Worker

The worker runs on bare metal with `/dev/kvm`. It manages Firecracker VMs.

### Core

| Variable             | Default                                | Description                      |
| -------------------- | -------------------------------------- | -------------------------------- |
| `PORT`               | `3000`                                 | HTTP listen port                 |
| `WORKER_NAME`        | `worker-{pid}`                         | Unique name for this worker      |
| `MAX_CONCURRENT_VMS` | `5`                                    | Max concurrent VM sessions       |
| `MAX_QUEUE_SIZE`     | `10`                                   | Max queued sessions              |
| `SNAPSHOT_DIR`       | `/var/lib/paws/snapshots/agent-latest` | Default snapshot directory       |
| `SNAPSHOT_BASE_DIR`  | `/var/lib/paws/snapshots`              | Base directory for all snapshots |
| `VM_BASE_DIR`        | `/var/lib/paws/vms`                    | Working directory for VM files   |
| `SSH_KEY_PATH`       | `/var/lib/paws/ssh/id_ed25519`         | SSH private key for VM access    |

### Call-home (control plane registration)

| Variable      | Default                   | Description                                           |
| ------------- | ------------------------- | ----------------------------------------------------- |
| `GATEWAY_URL` | --                        | Control plane URL (e.g., `https://fleet.example.com`) |
| `API_KEY`     | --                        | API key to authenticate with control plane            |
| `WORKER_URL`  | `http://localhost:{PORT}` | URL the control plane should use to reach this worker |

### Port exposure (Pangolin)

| Variable               | Default | Description                                                   |
| ---------------------- | ------- | ------------------------------------------------------------- |
| `PANGOLIN_API_URL`     | --      | Pangolin API base URL                                         |
| `PANGOLIN_ORG_ID`      | --      | Pangolin organization ID                                      |
| `PANGOLIN_SITE_ID`     | --      | Pangolin site ID for this worker                              |
| `PANGOLIN_DOMAIN_ID`   | --      | Pangolin domain ID for subdomain routing                      |
| `PANGOLIN_BASE_DOMAIN` | --      | Base domain for exposed ports (e.g., `fleet.example.com`)     |
| `PANGOLIN_API_KEY`     | --      | Pangolin API key                                              |
| `PANGOLIN_EMAIL`       | --      | Pangolin admin email (alternative to API key)                 |
| `PANGOLIN_PASSWORD`    | --      | Pangolin admin password                                       |
| `WORKER_EXTERNAL_URL`  | --      | Direct worker URL for port forwarding (non-Pangolin fallback) |

### Snapshot sync (R2)

| Variable                    | Default  | Description                               |
| --------------------------- | -------- | ----------------------------------------- |
| `SNAPSHOT_SYNC_ENABLED`     | `false`  | Enable snapshot sync from R2              |
| `R2_ENDPOINT`               | --       | Cloudflare R2 endpoint URL                |
| `R2_ACCESS_KEY_ID`          | --       | R2 access key                             |
| `R2_SECRET_ACCESS_KEY`      | --       | R2 secret key                             |
| `R2_BUCKET_NAME`            | --       | R2 bucket name                            |
| `SNAPSHOT_SYNC_INTERVAL_MS` | `300000` | Sync poll interval in ms (default: 5 min) |

---

## Example .env file

```bash
# Control plane
PORT=4000
API_KEY=paws-your-secret-key
DASHBOARD_DIR=/opt/paws/dashboard/dist
DATA_DIR=/var/lib/paws/data

# Worker discovery via Pangolin
PANGOLIN_API_URL=https://pangolin.example.com
PANGOLIN_ORG_ID=org-123
PANGOLIN_API_KEY=pk-your-key

# OIDC (Dex)
OIDC_ISSUER=https://fleet.example.com/dex
OIDC_CLIENT_ID=paws
OIDC_CLIENT_SECRET=your-oidc-secret
AUTH_SECRET=your-session-secret
OIDC_REDIRECT_URI=https://fleet.example.com/auth/callback
```
