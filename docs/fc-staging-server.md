# teampitch-fc-staging (Hetzner Dedicated Server)

## Hardware

| Spec | Details                                          |
| ---- | ------------------------------------------------ |
| CPU  | AMD Ryzen 5 3600 — 6 cores / 12 threads @ 3.6GHz |
| RAM  | 64 GB DDR4                                       |
| Disk | 2x 477 GB NVMe in RAID 1 (444 GB usable)         |
| Swap | 32 GB (RAID 1)                                   |

## Network

| Interface       | IP              |
| --------------- | --------------- |
| Public (enp9s0) | `65.108.10.170` |
| Tailscale       | `100.78.44.23`  |
| K3s flannel     | `10.42.0.0/24`  |

## OS

- Ubuntu 24.04.3 LTS (Noble Numbat)
- Hostname: `Ubuntu-2404-noble-amd64-base`

## Access

SSH is only available over Tailscale (port 22 bound to `100.78.44.23`).

```bash
# SSH as root (Tailscale ACLs require root)
ssh root@teampitch-fc-staging
```

Your Tailscale identity must be authorized in the tailnet ACLs. The user `alex` is **not** permitted
— use `root`.

## Architecture

### How agent execution works today

```
Linear issue (created/prompted)
  → Tappy Control Plane (k3s pod, :4030)
    → POST /sessions/execute to FC Worker (:3000)
      → Semaphore gate (max 5 concurrent, queue 10)
        → Restore Firecracker VM from snapshot
          → SSH into VM, write agent script
            → Claude Code runs inside VM (Anthropic OAuth)
              → Reads results JSON, posts back to Linear
                → VM destroyed (guaranteed cleanup)
```

**Key components:**

| Component                | Role                                                       | Location                              |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------- |
| `tappy-control-plane`    | Receives Linear webhooks, dispatches work                  | K3s pod                               |
| `fc-worker`              | Runs Firecracker VMs, manages concurrency                  | Bare metal process (:3000)            |
| `firecracker-manager`    | VM lifecycle service (separate from fc-worker)             | systemd service (:4020)               |
| `@teampitch/firecracker` | Package: snapshot restore, VM create/stop, networking, SSH | `/opt/fc-worker/packages/firecracker` |

### VM lifecycle (per session)

1. **Restore from snapshot** — `/var/lib/firecracker/snapshots/agent-latest/` (disk.ext4 4GB +
   memory.snap 4GB + vmstate.snap 30KB)
2. **Wait SSH** — polls VM IP over SSH (30s timeout)
3. **Write script** — generates `run-agent.sh` with env vars + prompt, writes via SSH
4. **Execute** — Claude Code runs inside the VM against the teampitch repo
5. **Read results** — reads `/tmp/agent-results.json` from VM
6. **Destroy** — stops VM, cleans up (always runs, even on failure)

### VM configuration

| Setting        | Default        | Env var                   |
| -------------- | -------------- | ------------------------- |
| vCPUs per VM   | 2              | `VM_VCPU_COUNT`           |
| Memory per VM  | 4096 MB        | `VM_MEMORY_MB`            |
| Timeout        | 600s (10 min)  | `VM_TIMEOUT_MS`           |
| Max session    | 3600s (60 min) | `MAX_SESSION_DURATION_MS` |
| Concurrent VMs | 5              | `MAX_CONCURRENT_VMS`      |
| Queue depth    | 10             | `MAX_QUEUE_SIZE`          |

### Disk assets

| Path                                              | Size  | Purpose                                       |
| ------------------------------------------------- | ----- | --------------------------------------------- |
| `/var/lib/firecracker/kernels/vmlinux-default`    | 40 MB | Linux kernel for VMs                          |
| `/var/lib/firecracker/rootfs/ubuntu-default.ext4` | 2 GB  | Base rootfs                                   |
| `/var/lib/firecracker/rootfs/agent-rootfs.ext4`   | 4 GB  | Agent rootfs (with repo + deps)               |
| `/var/lib/firecracker/snapshots/agent-latest/`    | ~8 GB | Pre-booted snapshot (disk + memory + vmstate) |
| `/var/lib/firecracker/ssh/`                       | —     | SSH keys for VM access                        |

### Capacity analysis (single server)

With 12 threads and 64 GB RAM, running 2 vCPU / 4 GB VMs:

- **CPU-bound limit:** 6 concurrent VMs (12 threads / 2 vCPU)
- **Memory-bound limit:** ~14 concurrent VMs (60 GB usable / 4 GB per VM)
- **Current config:** 5 concurrent + 10 queued = 15 in-flight max

The server is CPU-bound, not memory-bound. Currently configured conservatively.

## Services

### 1. FC Worker (process)

- **Binary:** `bun apps/fc-worker/src/server.ts`
- **Port:** `3000`
- **Working dir:** `/opt/fc-worker`
- **Purpose:** Accepts session execution requests, manages Firecracker VMs
- **Source:** `/opt/fc-worker/apps/fc-worker/`

```bash
# Health (includes VM stats + snapshot info)
curl http://100.78.44.23:3000/health

# Dashboard (health + cost + config)
curl -H "Authorization: Bearer $TOKEN" http://100.78.44.23:3000/dashboard

# Session history
curl -H "Authorization: Bearer $TOKEN" http://100.78.44.23:3000/sessions
```

### 2. Firecracker Manager (systemd)

- **Unit:** `firecracker-manager.service`
- **Binary:** `bun run apps/firecracker-manager/src/server.ts`
- **Port:** `4020`
- **Purpose:** VM lifecycle management, health reporting

```bash
# Status
ssh root@teampitch-fc-staging "systemctl status firecracker-manager"

# Logs
ssh root@teampitch-fc-staging "journalctl -u firecracker-manager -f"

# Health
curl http://100.78.44.23:4020/health
```

### 3. K3s (Lightweight Kubernetes)

- **Unit:** `k3s.service`
- **Version:** v1.34.4+k3s1
- **API:** `localhost:6443`

```bash
ssh root@teampitch-fc-staging "k3s kubectl get pods -A"
ssh root@teampitch-fc-staging "k3s kubectl get svc -A"
```

### 4. Tappy Control Plane (k3s pod)

- **Namespace:** `tappy`
- **Binary:** `bun run apps/tappy-control-plane/src/server.ts`
- **Port:** `4030` (ClusterIP)
- **Purpose:** Linear webhook receiver, dispatches agent sessions to fc-worker

### 5. Traefik Ingress (k3s)

- **Namespace:** `kube-system`
- **Ports:** `80` / `443` on public IP `65.108.10.170`

### 6. Tailscale Operator (k3s pod)

- **Namespace:** `tailscale`
- **Purpose:** Exposes k3s services to the tailnet

## Port Summary

| Port | Service             | Bind                            |
| ---- | ------------------- | ------------------------------- |
| 22   | SSH                 | Tailscale only (`100.78.44.23`) |
| 80   | Traefik             | Public (`65.108.10.170`)        |
| 443  | Traefik             | Public (`65.108.10.170`)        |
| 3000 | fc-worker           | `0.0.0.0`                       |
| 4020 | firecracker-manager | `0.0.0.0`                       |
| 4030 | tappy-control-plane | `0.0.0.0`                       |
| 6443 | K3s API             | `*`                             |

## Targeting from Local Machine

### Direct SSH commands

```bash
ssh root@teampitch-fc-staging "<command>"
ssh root@teampitch-fc-staging  # interactive
```

### Hit services via Tailscale

```bash
curl http://100.78.44.23:3000/health       # fc-worker
curl http://100.78.44.23:4020/health       # firecracker-manager
curl http://100.78.44.23:4030              # tappy-control-plane
```

### Hit services via public IP

```bash
curl http://65.108.10.170   # Traefik HTTP
curl https://65.108.10.170  # Traefik HTTPS
```

### K3s kubectl from local

```bash
scp root@teampitch-fc-staging:/etc/rancher/k3s/k3s.yaml ~/.kube/fc-staging.yaml
# Edit server: https://127.0.0.1:6443 → https://100.78.44.23:6443
KUBECONFIG=~/.kube/fc-staging.yaml kubectl get pods -A
```

### Rebuild VM snapshot

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" http://100.78.44.23:3000/snapshots/rebuild
```
