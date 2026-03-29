---
title: Quick Start
description: Create your first daemon, trigger a session, and see results in under five minutes.
---

This guide assumes you have a running paws instance. If not, [install paws first](/getting-started/install/).

## Set your API key

Every request needs an `Authorization` header. Export your key so the examples below work as-is:

```bash
export PAWS_URL="https://your-paws-host"
export PAWS_KEY="your-api-key"
```

## Create a daemon

A daemon is a persistent role definition. It tells paws what to run, when to run it, and what credentials to inject. Here you'll create a daemon that uses Claude Code to review pull requests:

```bash
curl -s -X POST "$PAWS_URL/v1/daemons" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "pr-reviewer",
    "description": "Review PRs and suggest improvements",
    "snapshot": "claude-code",
    "trigger": {
      "type": "webhook",
      "events": ["pull_request.opened"]
    },
    "agent": {
      "framework": "claude-code",
      "prompt": "Review the PR described in $TRIGGER_PAYLOAD. Focus on correctness, security, and readability. Write your review as a PR comment.",
      "maxTurns": 20,
      "allowedTools": ["Read", "Bash", "Write"]
    },
    "network": {
      "allowOut": ["api.anthropic.com", "github.com", "*.github.com"],
      "credentials": {
        "api.anthropic.com": {
          "headers": { "x-api-key": "sk-ant-your-key" }
        },
        "github.com": {
          "headers": { "Authorization": "Bearer ghp_your-token" }
        }
      }
    }
  }' | jq .
```

The response confirms the daemon is active:

```json
{
  "role": "pr-reviewer",
  "status": "active",
  "createdAt": "2026-03-29T10:00:00Z"
}
```

Your API keys are stored in the control plane. They never enter the VM.

## Trigger a session manually

Daemons fire automatically on their configured trigger (webhook, cron, etc.). You can also trigger one manually by posting to its webhook endpoint:

```bash
curl -s -X POST "$PAWS_URL/v1/webhooks/pr-reviewer" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "opened",
    "pull_request": {
      "number": 42,
      "title": "Add input validation",
      "html_url": "https://github.com/org/repo/pull/42"
    }
  }' | jq .
```

```json
{
  "accepted": true,
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

## Check session status

Poll the session until it completes:

```bash
curl -s "$PAWS_URL/v1/sessions/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Authorization: Bearer $PAWS_KEY" | jq .
```

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "exitCode": 0,
  "stdout": "Review posted to PR #42",
  "durationMs": 45000,
  "worker": "worker-node-1"
}
```

Possible status values: `pending`, `running`, `completed`, `failed`, `timeout`, `cancelled`.

## Run a one-shot session

You don't need a daemon for ad-hoc work. Submit a session directly:

```bash
curl -s -X POST "$PAWS_URL/v1/sessions" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot": "claude-code",
    "workload": {
      "type": "script",
      "script": "echo hello from inside the VM && uname -a"
    },
    "timeoutMs": 60000
  }' | jq .
```

The session runs in an ephemeral Firecracker VM, returns the output, and the VM is destroyed.

## View your fleet

Check worker capacity and health:

```bash
curl -s "$PAWS_URL/v1/fleet" \
  -H "Authorization: Bearer $PAWS_KEY" | jq .
```

```json
{
  "totalWorkers": 1,
  "healthyWorkers": 1,
  "totalCapacity": 5,
  "usedCapacity": 0,
  "queuedSessions": 0,
  "activeDaemons": 1
}
```

## Next steps

- [Architecture](/concepts/architecture/) -- understand how paws works under the hood
- [Security model](/concepts/security/) -- how zero-trust credential injection works
- [Claude Code agent](/agents/claude-code/) -- configure the agent framework
- [API reference](/reference/api/) -- full endpoint documentation
