---
title: Port Exposure
description: Expose ports from VMs to the internet via Pangolin tunnels with per-port access control.
---

Agents often run web servers -- dev servers, preview apps, dashboards. paws can expose ports from inside the VM to the internet through Pangolin tunnels, with access control on each port.

## How it works

1. Your daemon config declares which ports to expose
2. When the session starts, the worker creates iptables DNAT rules to forward traffic from the host to the VM
3. The worker registers each port as a Pangolin resource with a unique subdomain
4. Pangolin routes external traffic through its WireGuard tunnel to the worker, which forwards it to the VM
5. When the session ends, the resources are cleaned up

The result: each exposed port gets a public URL like `https://session-abc-3000.fleet.example.com`.

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
| `sso` (default) | Requires Pangolin login. Uses the OIDC provider configured on your control plane (Dex).                                              |
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

After a session starts, poll the session endpoint. The `exposedPorts` field contains the public URLs:

```bash
curl -s "$PAWS_URL/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $PAWS_KEY" | jq '.exposedPorts'
```

```json
[
  {
    "port": 3000,
    "url": "https://sess-abc-3000.fleet.example.com",
    "label": "Next.js dev server",
    "access": "sso",
    "shareLink": "https://fleet.example.com/share/abc123"
  },
  {
    "port": 5432,
    "url": "https://sess-abc-5432.fleet.example.com",
    "label": "pgAdmin",
    "access": "pin",
    "pin": "847291",
    "shareLink": "https://fleet.example.com/share/def456"
  }
]
```

## Shareable links

Every exposed port gets a time-limited shareable link. You can send this to anyone -- they don't need a Pangolin account. The link respects the port's access control mode (SSO, PIN, or email).

## Worker configuration

Port exposure requires Pangolin configuration on the worker. Set these environment variables:

```bash
PANGOLIN_API_URL=https://pangolin.example.com
PANGOLIN_ORG_ID=your-org-id
PANGOLIN_SITE_ID=your-site-id
PANGOLIN_BASE_DOMAIN=fleet.example.com
PANGOLIN_API_KEY=your-api-key
```

Without these, the `expose` field in daemon configs is silently ignored and ports are not exposed.

## Forwarded headers

Pangolin forwards standard headers to the VM's web server:

- `X-Forwarded-For` -- client's real IP
- `X-Forwarded-Proto` -- original protocol (https)
- `X-Forwarded-Host` -- the subdomain the client connected to

Your app inside the VM sees these as normal request headers.
