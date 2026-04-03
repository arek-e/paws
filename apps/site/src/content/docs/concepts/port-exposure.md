---
title: Port Exposure
description: Expose ports from VMs to authorized users via the control plane reverse proxy with per-port access control.
---

Agents often run web servers -- dev servers, preview apps, dashboards. paws can expose ports from inside the VM to authorized users through the control plane reverse proxy, with access control on each port.

## How it works

1. Your daemon config declares which ports to expose
2. When the session starts, the worker sets up routing from the host to the VM via the TAP device
3. The control plane acts as a reverse proxy, authenticating requests and forwarding them to the correct worker and VM
4. Each exposed port gets a session-scoped URL like `https://s-abc123.fleet.example.com`
5. When the session ends, the URLs stop working and resources are cleaned up

## Daemon config with port exposure

Add an `expose` array to your daemon's `network` config:

```json
{
  "role": "fullstack-dev",
  "snapshot": "fullstack",
  "agent": {
    "framework": "claude-code",
    "prompt": "Build a Next.js app based on $TRIGGER_PAYLOAD"
  },
  "network": {
    "allowOut": ["api.anthropic.com", "registry.npmjs.org", "github.com"],
    "credentials": {
      "api.anthropic.com": {
        "headers": { "x-api-key": "sk-ant-..." }
      }
    },
    "expose": [
      {
        "port": 3000,
        "protocol": "http",
        "label": "Next.js dev server",
        "access": "sso"
      },
      {
        "port": 5432,
        "protocol": "http",
        "label": "pgAdmin",
        "access": "pin"
      }
    ]
  }
}
```

## Access control modes

Each exposed port has an access control mode that determines who can reach it.

| Mode            | How it works                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `sso` (default) | Requires OIDC login via the provider configured on your control plane (Dex).                                                         |
| `pin`           | Auto-generates a numeric PIN. Anyone with the PIN can access the port. The PIN is returned in the session's `exposedPorts` response. |
| `email`         | Restricts access to specific email addresses or domains. Supports wildcards like `*@company.com`.                                    |

### Email whitelist example

```json
{
  "port": 3000,
  "label": "Preview app",
  "access": "email",
  "allowedEmails": ["*@company.com", "contractor@example.com"]
}
```

## Reading exposed port URLs

After a session starts, poll the session endpoint. The `exposedPorts` field contains the URLs:

```bash
curl -s "$PAWS_URL/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $PAWS_KEY" | jq '.exposedPorts'
```

```json
[
  {
    "port": 3000,
    "url": "https://s-abc123.fleet.example.com",
    "label": "Next.js dev server",
    "access": "sso"
  },
  {
    "port": 5432,
    "url": "https://s-abc123-5432.fleet.example.com",
    "label": "pgAdmin",
    "access": "pin",
    "pin": "847291"
  }
]
```

## Shareable links

Every exposed port gets a time-limited shareable link. The link respects the port's access control mode (SSO, PIN, or email).

## Architecture

Port exposure uses the control plane as a reverse proxy:

```
User browser
  |
  | https://s-abc123.fleet.example.com/
  |
  v
Control Plane
  1. Extract session ID from subdomain
  2. Authenticate (OIDC / PIN)
  3. Check port is in daemon's expose list
  4. Reverse-proxy to worker
  |
  v
Worker
  5. Route to session's VM via TAP device
  6. Forward to VM guest IP (172.16.x.2:port)
  |
  v
MicroVM (172.16.x.2)
  Dev server on :3000
```

The inbound preview path is separate from the outbound MITM proxy. Inbound traffic is a simple TCP forward from the control plane through the worker to the VM. The MITM proxy only handles outbound traffic (agent API calls with credential injection).

## WebSocket support

Dev servers use WebSockets for HMR (hot module replacement). The reverse proxy chain supports WebSocket upgrade through the control plane and worker to the VM.

## Forwarded headers

The control plane forwards standard headers to the VM's web server:

- `X-Forwarded-For` -- client's real IP
- `X-Forwarded-Proto` -- original protocol (https)
- `X-Forwarded-Host` -- the subdomain the client connected to

Your app inside the VM sees these as normal request headers.
