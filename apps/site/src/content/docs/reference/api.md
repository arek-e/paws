---
title: API Reference
description: Complete HTTP API reference for the paws control plane.
---

Base URL: `https://<your-paws-host>/v1`

All endpoints require `Authorization: Bearer <API_KEY>` unless noted. The OpenAPI spec is available at `/openapi.json`.

## Sessions

### Create session

```
POST /v1/sessions
```

Submit a workload for execution in an isolated VM.

```json
{
  "snapshot": "claude-code",
  "workload": {
    "type": "script",
    "script": "#!/bin/bash\necho hello",
    "env": { "MY_VAR": "value" }
  },
  "resources": { "vcpus": 2, "memoryMB": 4096 },
  "timeoutMs": 600000,
  "network": {
    "allowOut": ["api.anthropic.com", "github.com"],
    "credentials": {
      "api.anthropic.com": {
        "headers": { "x-api-key": "sk-ant-..." }
      }
    },
    "expose": [{ "port": 3000, "label": "Dev server", "access": "sso" }]
  },
  "callbackUrl": "https://myapp.com/webhooks/paws",
  "metadata": { "issueId": "123" }
}
```

| Field                 | Type     | Required | Default | Description                                         |
| --------------------- | -------- | -------- | ------- | --------------------------------------------------- |
| `snapshot`            | string   | Yes      | --      | Snapshot ID to boot from                            |
| `workload`            | object   | Yes      | --      | Script to execute (`type`, `script`, `env`)         |
| `resources.vcpus`     | number   | No       | 2       | vCPUs (1-8)                                         |
| `resources.memoryMB`  | number   | No       | 4096    | Memory in MB (256-16384)                            |
| `timeoutMs`           | number   | No       | 600000  | Max execution time in ms                            |
| `network.allowOut`    | string[] | No       | []      | Allowed outbound domains (supports `*.example.com`) |
| `network.credentials` | object   | No       | {}      | Per-domain credential headers                       |
| `network.expose`      | array    | No       | []      | Ports to expose via port exposure                   |
| `callbackUrl`         | string   | No       | --      | URL to POST result on completion                    |
| `metadata`            | object   | No       | --      | Opaque metadata, returned in result                 |

**Response: 202**

```json
{ "sessionId": "a1b2c3d4-...", "status": "pending" }
```

### Get session

```
GET /v1/sessions/:id
```

**Response: 200**

```json
{
  "sessionId": "a1b2c3d4-...",
  "status": "completed",
  "exitCode": 0,
  "stdout": "hello\n",
  "stderr": "",
  "output": { "key": "value" },
  "startedAt": "2026-03-29T10:00:00Z",
  "completedAt": "2026-03-29T10:00:05Z",
  "durationMs": 5000,
  "worker": "worker-node-1",
  "metadata": { "issueId": "123" },
  "resources": { "vcpus": 2, "memoryMB": 4096 },
  "vcpuSeconds": 10,
  "exposedPorts": [
    { "port": 3000, "url": "https://sess-abc-3000.fleet.example.com", "access": "sso" }
  ]
}
```

| Status      | Meaning                        |
| ----------- | ------------------------------ |
| `pending`   | Queued, waiting for a VM slot  |
| `running`   | VM active, workload executing  |
| `completed` | Finished successfully          |
| `failed`    | Workload error (non-zero exit) |
| `timeout`   | Exceeded timeoutMs             |
| `cancelled` | Cancelled via DELETE           |

### Cancel session

```
DELETE /v1/sessions/:id
```

**Response: 200**

```json
{ "sessionId": "a1b2c3d4-...", "status": "cancelled" }
```

---

## Daemons

### Register daemon

```
POST /v1/daemons
```

Register a daemon role. Activates immediately and begins watching for triggers. Provide either `workload` or `agent` (not both).

```json
{
  "role": "pr-helper",
  "description": "Review PRs and fix CI failures",
  "snapshot": "claude-code",
  "trigger": { "type": "webhook", "events": ["pull_request.opened"] },
  "agent": {
    "framework": "claude-code",
    "prompt": "Review the PR in $TRIGGER_PAYLOAD",
    "maxTurns": 20,
    "allowedTools": ["Read", "Bash"]
  },
  "network": { "allowOut": ["api.anthropic.com", "github.com"] },
  "governance": {
    "maxActionsPerHour": 20,
    "requiresApproval": ["merge"],
    "auditLog": true
  }
}
```

**Trigger types:**

| Type       | Fields                       | Description                          |
| ---------- | ---------------------------- | ------------------------------------ |
| `webhook`  | `events`, `secret`           | Fires when matching webhook received |
| `schedule` | `cron`                       | Fires on cron schedule               |
| `watch`    | `condition`, `intervalMs`    | Fires when polled condition is met   |
| `github`   | `repos`, `events`, `command` | Fires on GitHub App events           |

**Response: 201**

```json
{ "role": "pr-helper", "status": "active", "createdAt": "2026-03-29T10:00:00Z" }
```

### List daemons

```
GET /v1/daemons
```

### Get daemon

```
GET /v1/daemons/:role
```

### Update daemon

```
PATCH /v1/daemons/:role
```

Partial update. Send only the fields you want to change.

### Delete daemon

```
DELETE /v1/daemons/:role
```

Stops the daemon. Running sessions complete, but no new triggers are accepted.

---

## Webhooks

### Receive webhook

```
POST /v1/webhooks/:role
```

No auth required (validated via webhook secret configured in daemon). Triggers a session for the daemon with `TRIGGER_PAYLOAD` set to the request body.

**Response: 202**

```json
{ "accepted": true, "sessionId": "a1b2c3d4-..." }
```

---

## Snapshot Configs

### Create snapshot config

```
POST /v1/snapshot-configs
```

```json
{
  "id": "my-snapshot",
  "template": "node",
  "setup": "npm install -g typescript",
  "requiredDomains": ["registry.npmjs.org"],
  "resources": { "vcpus": 2, "memoryMB": 4096 }
}
```

**Response: 201** -- returns the created config.

### List snapshot configs

```
GET /v1/snapshot-configs
```

### Get snapshot config

```
GET /v1/snapshot-configs/:id
```

### Update snapshot config

```
PUT /v1/snapshot-configs/:id
```

### Delete snapshot config

```
DELETE /v1/snapshot-configs/:id
```

---

## Snapshots

### Build snapshot

```
POST /v1/snapshots/:id/build
```

Triggers a snapshot build from the config with the given ID.

**Response: 202**

```json
{ "snapshotId": "my-snapshot", "status": "building", "jobId": "build-a1b2c3d4" }
```

### List snapshots

```
GET /v1/snapshots
```

---

## Fleet

### Fleet overview

```
GET /v1/fleet
```

```json
{
  "totalWorkers": 3,
  "healthyWorkers": 3,
  "totalCapacity": 15,
  "usedCapacity": 7,
  "queuedSessions": 2,
  "activeDaemons": 4
}
```

### List workers

```
GET /v1/fleet/workers
```

Returns all workers with health status, capacity, and snapshot info.

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

| Code                    | HTTP | Meaning                        |
| ----------------------- | ---- | ------------------------------ |
| `UNAUTHORIZED`          | 401  | Invalid or missing API key     |
| `FORBIDDEN`             | 403  | API key lacks permission       |
| `SESSION_NOT_FOUND`     | 404  | Session ID not found           |
| `DAEMON_NOT_FOUND`      | 404  | Daemon role not found          |
| `DAEMON_ALREADY_EXISTS` | 409  | Daemon role already registered |
| `SNAPSHOT_NOT_FOUND`    | 404  | Snapshot ID not found          |
| `CAPACITY_EXHAUSTED`    | 503  | All workers are full           |
| `RATE_LIMITED`          | 429  | Governance rate limit exceeded |
| `VALIDATION_ERROR`      | 400  | Invalid request body           |
