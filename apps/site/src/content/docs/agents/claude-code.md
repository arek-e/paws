---
title: Claude Code Agent
description: Configure Claude Code as the agent framework inside paws VMs.
---

Claude Code is the default agent framework in paws. When you configure a daemon with `"framework": "claude-code"`, paws auto-generates a workload script that runs Claude Code CLI inside the VM with your prompt and constraints.

## How it works

1. You define an `agent` config on your daemon (instead of a raw `workload` script)
2. paws generates a bash script that installs Claude Code (if not already in the snapshot), then runs it with your parameters
3. The VM's proxy injects the Anthropic API key -- Claude Code never sees it directly
4. Output is written to `/output/result.json` in structured JSON format

## Agent config schema

```json
{
  "agent": {
    "framework": "claude-code",
    "prompt": "Review the PR described in $TRIGGER_PAYLOAD",
    "maxTurns": 20,
    "maxBudgetUsd": 5.0,
    "allowedTools": ["Read", "Edit", "Bash", "Write"],
    "model": "sonnet",
    "extraArgs": ["--verbose"]
  }
}
```

| Field          | Type            | Default                             | Description                                               |
| -------------- | --------------- | ----------------------------------- | --------------------------------------------------------- |
| `framework`    | `"claude-code"` | Required                            | Agent framework to use                                    |
| `prompt`       | string          | `"$TRIGGER_PAYLOAD"`                | The task prompt. Supports `$TRIGGER_PAYLOAD` placeholder. |
| `maxTurns`     | number          | unlimited                           | Max agentic turns before stopping                         |
| `maxBudgetUsd` | number          | unlimited                           | Spending cap in USD                                       |
| `allowedTools` | string[]        | `["Read", "Edit", "Bash", "Write"]` | Which Claude Code tools the agent can use                 |
| `model`        | string          | default                             | Model name (e.g., `"sonnet"`, `"opus"`)                   |
| `extraArgs`    | string[]        | none                                | Additional CLI flags passed to `claude`                   |

## Credential injection

The Anthropic API key is injected by the per-VM proxy. Add `api.anthropic.com` to your daemon's network allowlist with the API key header:

```json
{
  "network": {
    "allowOut": ["api.anthropic.com", "github.com"],
    "credentials": {
      "api.anthropic.com": {
        "headers": { "x-api-key": "sk-ant-your-key" }
      },
      "github.com": {
        "headers": { "Authorization": "Bearer ghp_your-token" }
      }
    }
  }
}
```

Claude Code inside the VM makes normal HTTPS calls to `api.anthropic.com`. The proxy intercepts, injects the `x-api-key` header, and forwards. The key never exists in the VM's memory or environment.

## Example: PR reviewer

```bash
curl -X POST "$PAWS_URL/v1/daemons" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "pr-reviewer",
    "description": "Review PRs for correctness and security",
    "snapshot": "claude-code",
    "trigger": {
      "type": "webhook",
      "events": ["pull_request.opened", "pull_request.synchronize"]
    },
    "agent": {
      "framework": "claude-code",
      "prompt": "Clone the repo, check out the PR branch, and review the changes. Focus on bugs, security issues, and readability. Post your review as a GitHub PR comment. PR details: $TRIGGER_PAYLOAD",
      "maxTurns": 30,
      "maxBudgetUsd": 2.00,
      "allowedTools": ["Read", "Bash", "Write"]
    },
    "network": {
      "allowOut": ["api.anthropic.com", "github.com", "*.github.com"],
      "credentials": {
        "api.anthropic.com": { "headers": { "x-api-key": "sk-ant-..." } },
        "github.com": { "headers": { "Authorization": "Bearer ghp_..." } }
      }
    }
  }'
```

## Example: issue triage

```bash
curl -X POST "$PAWS_URL/v1/daemons" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "issue-triage",
    "description": "Label and prioritize new issues",
    "snapshot": "claude-code",
    "trigger": {
      "type": "webhook",
      "events": ["issues.opened"]
    },
    "agent": {
      "framework": "claude-code",
      "prompt": "Read the GitHub issue in $TRIGGER_PAYLOAD. Analyze the issue, add appropriate labels (bug, feature, docs, etc.), set priority, and post a comment summarizing the issue and suggested next steps.",
      "maxTurns": 10,
      "maxBudgetUsd": 0.50
    },
    "network": {
      "allowOut": ["api.anthropic.com", "github.com", "api.github.com"],
      "credentials": {
        "api.anthropic.com": { "headers": { "x-api-key": "sk-ant-..." } },
        "github.com": { "headers": { "Authorization": "Bearer ghp_..." } }
      }
    }
  }'
```

## Example: scheduled deploy checker

```bash
curl -X POST "$PAWS_URL/v1/daemons" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "deploy-checker",
    "description": "Check production health every 6 hours",
    "snapshot": "claude-code",
    "trigger": {
      "type": "schedule",
      "cron": "0 */6 * * *"
    },
    "agent": {
      "framework": "claude-code",
      "prompt": "Check the health of our production services. Curl the health endpoints, verify response codes, check for error patterns in recent logs. Write a summary to /output/result.json.",
      "maxTurns": 15,
      "allowedTools": ["Bash", "Read", "Write"]
    },
    "network": {
      "allowOut": ["api.anthropic.com", "api.example.com"],
      "credentials": {
        "api.anthropic.com": { "headers": { "x-api-key": "sk-ant-..." } },
        "api.example.com": { "headers": { "Authorization": "Bearer prod-token-..." } }
      }
    }
  }'
```

## Recommended snapshot

Use the `claude-code` snapshot template. It includes Node.js, Claude Code CLI, jq, and ripgrep pre-installed, so the agent starts faster. See [Snapshots](/concepts/snapshots/) for details.
