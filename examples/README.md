# Examples

```
 /\_/\
( o.o )  try these out
 > ^ <
```

Runnable scripts that demonstrate paws features against a live instance.

## Prerequisites

1. A running paws instance (gateway + worker):
   ```bash
   bun run start
   ```
2. Set your gateway URL and API key:
   ```bash
   export PAWS_URL=http://localhost:4000
   export PAWS_API_KEY=paws-dev-key
   ```

## Scripts

| Script                   | What it does                              |
| ------------------------ | ----------------------------------------- |
| `01-health-check.sh`     | Verify the gateway and worker are running |
| `02-hello-world.sh`      | Run a simple script in an isolated VM     |
| `03-agent-with-creds.sh` | Run a session with credential injection   |
| `04-register-daemon.sh`  | Register a webhook-triggered daemon       |
| `05-list-resources.sh`   | List sessions, daemons, fleet status      |
| `06-openapi-spec.sh`     | Fetch the auto-generated OpenAPI spec     |

## Running

```bash
# Run all examples in order
for f in examples/0*.sh; do bash "$f"; echo; done

# Or run individually
bash examples/01-health-check.sh
```

## Targeting your staging server

```bash
export PAWS_URL=http://100.78.44.23:4000
export PAWS_API_KEY=your-production-key
bash examples/01-health-check.sh
```
