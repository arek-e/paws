---
description: Deploy configuration and infrastructure access
globs: ['infra/**', 'ops/**', 'Dockerfile*', '.github/**']
---

# Deploy Configuration

- Platform: Kubernetes on Hetzner (manual/Pulumi)
- Merge method: squash
- Pre-merge: `bun test` (unit tests)
- Deploy trigger: manual (`pulumi up` from infra/pulumi/ or `kubectl apply` from infra/k8s/)
- Deploy status: SSH to teampitch-fc-staging, check `kubectl get pods`
- Health check: `curl http://100.78.44.23:4000/health` (gateway via Tailscale)

## Test Server

`ssh root@teampitch-fc-staging` (Tailscale). Ryzen 5 3600, 64GB RAM. See `docs/fc-staging-server.md`.
