---
title: Custom Workloads
description: Run arbitrary scripts inside paws VMs instead of using an agent framework.
---

Not every workload needs an agent framework. You can run any bash script inside a paws VM using the `workload` field. This is useful for build tasks, data processing, custom agent setups, or anything that doesn't fit the agent config model.

## Script workload type

Instead of an `agent` config, provide a `workload` with `type: "script"`:

```json
{
  "workload": {
    "type": "script",
    "script": "#!/bin/bash\nset -euo pipefail\necho 'Hello from the VM'\nuname -a",
    "env": {
      "MY_VAR": "some-value"
    }
  }
}
```

| Field    | Type       | Required | Description                                           |
| -------- | ---------- | -------- | ----------------------------------------------------- |
| `type`   | `"script"` | Yes      | Must be `"script"`                                    |
| `script` | string     | Yes      | Bash script to execute                                |
| `env`    | object     | No       | Non-secret environment variables injected into the VM |

The script runs as root inside the VM. It has access to all tools installed in the snapshot.

## Environment variables

Your script receives several environment variables automatically:

| Variable          | Description                                                                             |
| ----------------- | --------------------------------------------------------------------------------------- |
| `SESSION_TOKEN`   | Identifies this session to the control plane                                            |
| `GATEWAY_URL`     | Control plane URL for status reporting                                                  |
| `TRIGGER_PAYLOAD` | The event that triggered this session (JSON string, only for daemon-triggered sessions) |

Plus any custom vars you set in the `env` field.

**Important:** The `env` field is for non-secret values only. Secrets should go in `network.credentials` and are injected at the proxy level, not as environment variables.

## Reading TRIGGER_PAYLOAD

When a daemon triggers a session, the webhook body (or cron metadata) is available as `$TRIGGER_PAYLOAD`. Parse it in your script:

```bash
#!/bin/bash
set -euo pipefail

# Parse the trigger payload
PR_NUMBER=$(echo "$TRIGGER_PAYLOAD" | jq -r '.pull_request.number')
REPO=$(echo "$TRIGGER_PAYLOAD" | jq -r '.repository.full_name')

echo "Processing PR #$PR_NUMBER in $REPO"

# Do your work...
git clone "https://github.com/$REPO" /tmp/repo
cd /tmp/repo
git fetch origin "pull/$PR_NUMBER/head:pr-$PR_NUMBER"
git checkout "pr-$PR_NUMBER"

# Run tests, linting, whatever
npm install
npm test
```

## Writing structured results

Write a JSON file to `/output/result.json`. paws reads this file after your script finishes and includes it in the session response under the `output` field.

```bash
#!/bin/bash
set -euo pipefail

# Do your work...
RESULT=$(npm test 2>&1) || true
EXIT=$?

# Write structured output
cat > /output/result.json <<EOF
{
  "testsRan": true,
  "exitCode": $EXIT,
  "summary": "$(echo "$RESULT" | tail -5 | jq -Rs .)"
}
EOF
```

When you poll the session:

```json
{
  "sessionId": "abc-123",
  "status": "completed",
  "exitCode": 0,
  "stdout": "...",
  "output": {
    "testsRan": true,
    "exitCode": 0,
    "summary": "Tests: 42 passed, 0 failed"
  }
}
```

## One-shot session example

For ad-hoc work, submit a session directly without creating a daemon:

```bash
curl -X POST "$PAWS_URL/v1/sessions" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot": "node",
    "workload": {
      "type": "script",
      "script": "#!/bin/bash\nset -euo pipefail\nnode -e \"console.log(JSON.stringify({result: 42}))\" > /output/result.json",
      "env": { "NODE_ENV": "production" }
    },
    "timeoutMs": 120000,
    "network": {
      "allowOut": ["registry.npmjs.org"]
    }
  }'
```

## Daemon with custom workload

```bash
curl -X POST "$PAWS_URL/v1/daemons" \
  -H "Authorization: Bearer $PAWS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "nightly-build",
    "description": "Build and test every night at 2am",
    "snapshot": "fullstack",
    "trigger": {
      "type": "schedule",
      "cron": "0 2 * * *"
    },
    "workload": {
      "type": "script",
      "script": "#!/bin/bash\nset -euo pipefail\ncd /state/repo\ngit pull\nnpm ci\nnpm run build\nnpm test > /output/result.json 2>&1"
    },
    "network": {
      "allowOut": ["github.com", "registry.npmjs.org"],
      "credentials": {
        "github.com": {
          "headers": { "Authorization": "Bearer ghp_..." }
        }
      }
    }
  }'
```

## When to use workloads vs agents

Use **agent config** (`agent` field) when you want Claude Code (or a future framework) to reason about a task autonomously.

Use **script workloads** (`workload` field) when you have a deterministic script to run, or when you're integrating a framework that paws doesn't have built-in support for.

You must provide one or the other -- a daemon with neither `agent` nor `workload` is rejected.
