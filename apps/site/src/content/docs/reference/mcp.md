---
title: MCP Server
description: Connect AI tools like Claude Code and Cursor to paws via the Model Context Protocol.
---

paws ships an MCP server that lets AI agents manage servers, sessions, daemons, and fleet status
directly from tools like Claude Code, Cursor, Windsurf, and VS Code.

## Quick setup

### Claude Code

```bash
claude mcp add paws -- bunx @paws/mcp-server
```

Then set your environment:

```bash
export PAWS_URL=http://your-control-plane:3000
export PAWS_API_KEY=your-api-key
```

Or configure it in your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "paws": {
      "command": "bunx",
      "args": ["@paws/mcp-server"],
      "env": {
        "PAWS_URL": "http://your-control-plane:3000",
        "PAWS_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "paws": {
      "command": "npx",
      "args": ["-y", "@paws/mcp-server"],
      "env": {
        "PAWS_URL": "http://your-control-plane:3000",
        "PAWS_API_KEY": "your-api-key"
      }
    }
  }
}
```

### VS Code

Add to your VS Code settings or `.vscode/mcp.json`:

```json
{
  "servers": {
    "paws": {
      "command": "npx",
      "args": ["-y", "@paws/mcp-server"],
      "env": {
        "PAWS_URL": "http://your-control-plane:3000",
        "PAWS_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available tools

### Sessions

| Tool               | Description                                   |
| ------------------ | --------------------------------------------- |
| `list-sessions`    | List recent sessions with status and output   |
| `create-session`   | Run a workload in an isolated Firecracker VM  |
| `get-session`      | Get session details, output, exit code        |
| `cancel-session`   | Cancel a running or pending session           |
| `wait-for-session` | Poll until a session reaches a terminal state |

### Daemons

| Tool              | Description                                       |
| ----------------- | ------------------------------------------------- |
| `list-daemons`    | List all daemons with status and trigger config   |
| `get-daemon`      | Get daemon details and recent sessions            |
| `create-daemon`   | Create a new daemon (webhook or schedule trigger) |
| `update-daemon`   | Update daemon description or configuration        |
| `delete-daemon`   | Stop and remove a daemon                          |
| `trigger-webhook` | Manually trigger a daemon with a payload          |

### Fleet

| Tool             | Description                                |
| ---------------- | ------------------------------------------ |
| `fleet-overview` | Worker count, active sessions, queue depth |
| `list-workers`   | All worker nodes with health and capacity  |
| `cost-summary`   | vCPU-seconds usage by daemon               |
| `list-snapshots` | Available VM snapshots                     |

### Servers

| Tool              | Description                                    |
| ----------------- | ---------------------------------------------- |
| `test-connection` | Test SSH connectivity before adding a server   |
| `add-server`      | Add a worker via SSH (password or private key) |
| `add-server-ec2`  | Launch and bootstrap an AWS EC2 instance       |
| `list-servers`    | List registered servers with status            |
| `delete-server`   | Remove a server                                |

## OAuth authentication

For remote access without API keys, paws supports OAuth 2.1 with PKCE. This lets MCP clients
authenticate through the paws dashboard login instead of manually managing API keys.

The control plane exposes standard OAuth discovery endpoints:

| Endpoint                                  | Purpose                         |
| ----------------------------------------- | ------------------------------- |
| `/.well-known/oauth-protected-resource`   | Resource metadata (RFC 9728)    |
| `/.well-known/oauth-authorization-server` | Server metadata (RFC 8414)      |
| `/oauth/register`                         | Dynamic client registration     |
| `/oauth/authorize`                        | Authorization (login + consent) |
| `/oauth/token`                            | Token exchange                  |

OAuth requires HTTPS. Set the `EXTERNAL_URL` environment variable on the control plane to your
public URL (e.g., `https://fleet.example.com`) for the discovery endpoints to return correct URLs.

## Environment variables

| Variable       | Default                 | Description                          |
| -------------- | ----------------------- | ------------------------------------ |
| `PAWS_URL`     | `http://localhost:4000` | Control plane URL                    |
| `PAWS_API_KEY` | (required)              | API key for authentication           |
| `LOG_LEVEL`    | `info`                  | Log level (debug, info, warn, error) |

## Examples

Ask your AI agent to:

- _"List all paws sessions from the last hour"_
- _"Create a session that runs `echo hello` in the test-minimal snapshot"_
- _"Show me the fleet health"_
- _"Add my server at 65.108.10.170 with password auth"_
- _"Test the SSH connection to 10.0.0.1 on port 2222"_
- _"Trigger the pr-reviewer daemon with this PR payload"_
