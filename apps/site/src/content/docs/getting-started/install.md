---
title: Installation
description: Install paws on any Linux VPS with a single command.
---

## One-line install

```bash
curl -fsSL https://getpaws.dev/install.sh | bash
```

This installs Docker (if missing), clones the repo, generates all secrets, and starts the full stack. Works on Ubuntu, Debian, Fedora, CentOS.

**Requirements:**

- Linux server (VPS or bare metal)
- Root access
- Ports 80, 443 open

No Cloudflare or DNS provider account needed. Domain is optional.

## Non-interactive install

```bash
curl -fsSL https://getpaws.dev/install.sh | bash -s -- \
  --domain yourdomain.com \
  --email admin@yourdomain.com
```

## What it sets up

| Service             | Purpose                            |
| ------------------- | ---------------------------------- |
| **Gateway**         | paws control plane API + dashboard |
| **Dex**             | OIDC identity provider (SSO)       |
| **VictoriaMetrics** | Metrics storage                    |
| **Grafana**         | Dashboards                         |

## Adding a domain later

If you installed without a domain (bare IP):

1. Point `*.yourdomain.com` to your server's IP (A record)
2. Edit `/opt/paws/.env` and set `DOMAIN=yourdomain.com`
3. Run: `cd /opt/paws && bash scripts/setup-control-plane.sh`

TLS certificates are provisioned automatically via HTTP-01 challenge.

## Updating

```bash
cd /opt/paws && git pull && docker compose up -d --build
```

## Adding a worker

After the control plane is running, add worker nodes to run VMs:

```bash
# On the worker machine:
curl -fsSL https://getpaws.dev/install.sh | bash  # install Docker
./scripts/setup-worker.sh                           # connects to control plane
```

The worker connects via WebSocket call-home and appears in the dashboard automatically.
