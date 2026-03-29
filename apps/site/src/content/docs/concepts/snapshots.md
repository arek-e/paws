---
title: Snapshots
description: Pre-built VM images that restore in under a second. Templates, custom builds, and R2 distribution.
---

A snapshot is a frozen VM state -- kernel, root filesystem, memory, and CPU registers. When a session starts, the worker copies the disk (copy-on-write) and resumes the VM from the snapshot. Boot time is under 1 second.

## Built-in templates

paws ships with six snapshot templates. Each one builds on a minimal Ubuntu base with SSH, git, and curl pre-installed.

| Template      | What's included                          | Required domains                      |
| ------------- | ---------------------------------------- | ------------------------------------- |
| `minimal`     | Base OS + SSH + git                      | None                                  |
| `node`        | Node.js 22 LTS + npm                     | `registry.npmjs.org`, `nodejs.org`    |
| `python`      | Python 3.12 + pip + venv                 | `pypi.org`, `files.pythonhosted.org`  |
| `docker`      | Docker CE + Compose plugin               | Docker registries                     |
| `fullstack`   | Docker + Node.js + Bun                   | Docker registries + npm + Bun         |
| `claude-code` | Node.js + Claude Code CLI + jq + ripgrep | `api.anthropic.com`, `claude.ai`, npm |

When you reference a template in your daemon config (e.g., `"snapshot": "claude-code"`), the worker restores from that template's snapshot.

## Building a snapshot from a template

Use the snapshot config API to create a config, then trigger a build:

```bash
# Create a snapshot config from a template
curl -X POST "$PAWS_URL/v1/snapshot-configs" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-node-snapshot",
    "template": "node",
    "setup": "npm install -g typescript eslint",
    "resources": { "vcpus": 2, "memoryMB": 4096 }
  }'

# Trigger the build
curl -X POST "$PAWS_URL/v1/snapshots/my-node-snapshot/build" \
  -H "Authorization: Bearer $PAWS_KEY"
```

The `setup` field is a bash script that runs inside a fresh VM. When the template field is set, the template's setup script runs first, then your custom setup script runs on top.

## Custom snapshots

You can skip templates entirely and provide a full setup script:

```bash
curl -X POST "$PAWS_URL/v1/snapshot-configs" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ml-workbench",
    "setup": "apt-get update && apt-get install -y python3 python3-pip && pip3 install torch transformers",
    "requiredDomains": ["pypi.org", "files.pythonhosted.org", "huggingface.co"],
    "resources": { "vcpus": 4, "memoryMB": 8192 }
  }'
```

The `requiredDomains` field tells paws which domains the setup script needs to reach during the build process. These are automatically added to the proxy allowlist for the build session.

## Snapshot contents

Each snapshot produces four files:

| File           | Size (typical) | Purpose            |
| -------------- | -------------- | ------------------ |
| `vmlinux`      | ~40 MB         | Linux kernel       |
| `disk.ext4`    | ~2-4 GB        | Root filesystem    |
| `memory.snap`  | ~4 GB          | Full memory state  |
| `vmstate.snap` | ~30 KB         | CPU register state |

On restore, the disk is copied with `cp --reflink=auto` (instant on btrfs/xfs, fast copy on ext4). The memory and vmstate are loaded directly by Firecracker.

## Snapshot distribution via R2

In multi-node deployments, snapshots are distributed to workers via Cloudflare R2. When a snapshot is built (or rebuilt), it's uploaded to R2. Each worker runs a sync loop that checks for new versions and pulls them automatically.

Configure sync on the worker:

```bash
SNAPSHOT_SYNC_ENABLED=true
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-key
R2_SECRET_ACCESS_KEY=your-secret
R2_BUCKET_NAME=paws-snapshots
SNAPSHOT_SYNC_INTERVAL_MS=300000  # 5 minutes
```

The sync loop compares a local manifest against R2, downloads changed files to a temp directory, then atomically swaps the snapshot directory. Running VMs are not affected -- they use their own copy-on-write disk copy.

## Snapshot security

- Snapshots are checksummed (SHA-256) on build
- Workers verify checksums before restoring
- Snapshot files are read-only on the host
- Each session gets a CoW disk copy -- VMs cannot modify the base snapshot
