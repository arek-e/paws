# API Reference

```
 /\_/\
( o.o )  paws API
 > ^ <
```

All endpoints require `Authorization: Bearer <API_KEY>` unless noted.

Base URL: `https://<gateway-host>/v1`

---

## Sessions

### Create Session

```
POST /v1/sessions
```

Submit a workload for execution in an isolated Firecracker VM.

**Request:**

```json
{
  "snapshot": "claude-agent",
  "workload": {
    "type": "script",
    "script": "#!/bin/bash\necho hello",
    "env": {
      "MY_VAR": "value"
    }
  },
  "resources": {
    "vcpus": 2,
    "memoryMB": 4096
  },
  "timeoutMs": 600000,
  "network": {
    "allowOut": ["api.anthropic.com", "github.com"],
    "credentials": {
      "api.anthropic.com": {
        "headers": { "x-api-key": "sk-ant-..." }
      }
    }
  },
  "callbackUrl": "https://myapp.com/webhooks/paws",
  "metadata": {
    "issueId": "123"
  }
}
```

| Field                 | Type       | Required | Description                                  |
| --------------------- | ---------- | -------- | -------------------------------------------- |
| `snapshot`            | string     | yes      | Snapshot ID to boot from                     |
| `workload.type`       | `"script"` | yes      | Workload type (script only for v0.1)         |
| `workload.script`     | string     | yes      | Bash script to execute in the VM             |
| `workload.env`        | object     | no       | Environment variables (non-secret)           |
| `resources.vcpus`     | number     | no       | vCPUs (1-8, default 2)                       |
| `resources.memoryMB`  | number     | no       | Memory in MB (256-16384, default 4096)       |
| `timeoutMs`           | number     | no       | Max execution time (default 600000 = 10 min) |
| `network.allowOut`    | string[]   | no       | Allowed outbound domains (default: none)     |
| `network.credentials` | object     | no       | Per-domain credential injection (headers)    |
| `callbackUrl`         | string     | no       | URL to POST result when complete             |
| `metadata`            | object     | no       | Opaque metadata, returned in result          |

**Response (202):**

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending"
}
```

### Get Session

```
GET /v1/sessions/:id
```

**Response (200):**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "completed",
  "exitCode": 0,
  "stdout": "hello\n",
  "stderr": "",
  "output": { "key": "value" },
  "startedAt": "2026-03-26T10:00:00Z",
  "completedAt": "2026-03-26T10:00:05Z",
  "durationMs": 5000,
  "worker": "worker-node-1",
  "metadata": { "issueId": "123" }
}
```

| Status      | Meaning                        |
| ----------- | ------------------------------ |
| `pending`   | Queued, waiting for VM slot    |
| `running`   | VM active, workload executing  |
| `completed` | Finished successfully          |
| `failed`    | Workload error (non-zero exit) |
| `timeout`   | Exceeded timeoutMs             |
| `cancelled` | Cancelled via DELETE           |

### Cancel Session

```
DELETE /v1/sessions/:id
```

**Response (200):**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "cancelled"
}
```

---

## Daemons

### Register Daemon

```
POST /v1/daemons
```

Register a daemon role. The daemon activates immediately and begins watching for triggers.

**Request:**

```json
{
  "role": "pr-helper",
  "description": "Review PRs and fix CI failures",
  "snapshot": "claude-agent",
  "trigger": {
    "type": "webhook",
    "events": ["pull_request.opened", "check_suite.failed"]
  },
  "workload": {
    "type": "script",
    "script": "cd /state/repo && git pull && claude-code --prompt \"$TRIGGER_PAYLOAD\"",
    "env": {}
  },
  "resources": {
    "vcpus": 2,
    "memoryMB": 4096
  },
  "network": {
    "allowOut": ["api.anthropic.com", "github.com", "*.github.com"],
    "credentials": {
      "api.anthropic.com": {
        "headers": { "x-api-key": "sk-ant-..." }
      },
      "github.com": {
        "headers": { "Authorization": "Bearer ghp_..." }
      }
    }
  },
  "governance": {
    "maxActionsPerHour": 20,
    "requiresApproval": ["merge", "deploy"],
    "auditLog": true
  }
}
```

**Trigger types:**

```json
// Webhook: fires when gateway receives matching webhook
{ "type": "webhook", "events": ["pull_request.opened"], "secret": "whsec_..." }

// Schedule: fires on cron
{ "type": "schedule", "cron": "0 */6 * * *" }

// Watch: fires when condition is met (polled)
{ "type": "watch", "condition": "github:org/repo:open_prs > 5", "intervalMs": 60000 }
```

**Response (201):**

```json
{
  "role": "pr-helper",
  "status": "active",
  "createdAt": "2026-03-26T10:00:00Z"
}
```

### List Daemons

```
GET /v1/daemons
```

**Response (200):**

```json
{
  "daemons": [
    {
      "role": "pr-helper",
      "description": "Review PRs and fix CI failures",
      "status": "active",
      "trigger": { "type": "webhook", "events": ["pull_request.opened"] },
      "stats": {
        "totalInvocations": 42,
        "lastInvokedAt": "2026-03-26T09:30:00Z",
        "avgDurationMs": 45000
      }
    }
  ]
}
```

### Get Daemon

```
GET /v1/daemons/:role
```

**Response (200):**

```json
{
  "role": "pr-helper",
  "description": "Review PRs and fix CI failures",
  "status": "active",
  "trigger": { ... },
  "governance": { ... },
  "stats": { ... },
  "recentSessions": [
    {
      "sessionId": "...",
      "triggeredAt": "2026-03-26T09:30:00Z",
      "status": "completed",
      "durationMs": 45000
    }
  ]
}
```

### Update Daemon

```
PATCH /v1/daemons/:role
```

Partial update of daemon configuration.

**Request:**

```json
{
  "governance": { "maxActionsPerHour": 50 }
}
```

### Delete Daemon

```
DELETE /v1/daemons/:role
```

Stops the daemon. Any running session completes, but no new triggers are accepted.

---

## Webhooks

### Receive Webhook

```
POST /v1/webhooks/:role
```

No auth required (validated via webhook secret configured in daemon).

Gateway receives the webhook payload, validates the signature, checks governance rules, and creates
a session for the daemon with `TRIGGER_PAYLOAD` set to the webhook body.

**Response (202):**

```json
{
  "accepted": true,
  "sessionId": "a1b2c3d4-..."
}
```

---

## Fleet

### Fleet Overview

```
GET /v1/fleet
```

**Response (200):**

```json
{
  "totalWorkers": 3,
  "healthyWorkers": 3,
  "totalCapacity": 15,
  "usedCapacity": 7,
  "queuedSessions": 2,
  "activeDaemons": 4,
  "activeSessions": 7
}
```

### List Workers

```
GET /v1/fleet/workers
```

**Response (200):**

```json
{
  "workers": [
    {
      "name": "worker-node-1",
      "status": "healthy",
      "capacity": {
        "maxConcurrent": 5,
        "running": 3,
        "queued": 1,
        "available": 2
      },
      "snapshot": {
        "id": "claude-agent",
        "version": 3,
        "ageMs": 86400000
      },
      "uptime": 604800
    }
  ]
}
```

---

## Snapshots

### Build Snapshot

```
POST /v1/snapshots/:id/build
```

**Request:**

```json
{
  "base": "ubuntu-24.04",
  "setup": "apt-get update && apt-get install -y nodejs git && npm install -g @anthropic-ai/claude-code",
  "resources": {
    "vcpus": 2,
    "memoryMB": 4096
  }
}
```

**Response (202):**

```json
{
  "snapshotId": "claude-agent",
  "status": "building",
  "jobId": "build-a1b2c3d4"
}
```

### List Snapshots

```
GET /v1/snapshots
```

**Response (200):**

```json
{
  "snapshots": [
    {
      "id": "claude-agent",
      "version": 3,
      "createdAt": "2026-03-25T10:00:00Z",
      "size": {
        "disk": "4.0 GB",
        "memory": "4.0 GB",
        "total": "8.0 GB"
      },
      "config": {
        "vcpus": 2,
        "memoryMB": 4096
      }
    }
  ]
}
```

---

## Errors

All errors follow a consistent format:

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session a1b2c3d4-... not found"
  }
}
```

| Code                    | HTTP Status | Meaning                        |
| ----------------------- | ----------- | ------------------------------ |
| `UNAUTHORIZED`          | 401         | Invalid or missing API key     |
| `FORBIDDEN`             | 403         | API key lacks permission       |
| `SESSION_NOT_FOUND`     | 404         | Session ID not found           |
| `DAEMON_NOT_FOUND`      | 404         | Daemon role not found          |
| `DAEMON_ALREADY_EXISTS` | 409         | Daemon role already registered |
| `SNAPSHOT_NOT_FOUND`    | 404         | Snapshot ID not found          |
| `CAPACITY_EXHAUSTED`    | 503         | All worker nodes are full      |
| `RATE_LIMITED`          | 429         | Governance rate limit exceeded |
| `VALIDATION_ERROR`      | 400         | Invalid request body           |
