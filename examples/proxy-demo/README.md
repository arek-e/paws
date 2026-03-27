# Proxy Demo

Demonstrates paws' zero-secret credential injection using Docker.

An "agent" container makes HTTPS requests to api.anthropic.com — but has **no API keys**.
The proxy container intercepts the traffic and injects the configured credentials at the
network layer. The agent never sees the key.

## How it works

```
Agent container                 Proxy container               Upstream
(no API keys)                   (has credentials)
     |                               |                           |
     |-- HTTPS_PROXY=proxy:8080 ---->|                           |
     |   GET api.anthropic.com       |                           |
     |                               |-- injects x-api-key ----->|
     |                               |   forwards request        |
     |<-- response ------------------|<-- response --------------|
```

This demo uses **HTTPS_PROXY mode** (explicit proxy via environment variable).
In production, paws uses **transparent iptables DNAT mode** — the agent doesn't
even know a proxy exists. All port 80/443 traffic is silently redirected.

## Prerequisites

- Docker and Docker Compose

## Run

```bash
# Option 1: Use the demo script
./demo.sh

# Option 2: Manual
cp config.example.yaml config.yaml
# Edit config.yaml with your real API keys
docker compose up -d
docker compose exec agent sh -c 'apk add curl && curl -x http://proxy:8080 https://api.anthropic.com/v1/messages'
docker compose down
```

## Config

Copy `config.example.yaml` to `config.yaml` and replace the placeholder keys:

```yaml
listen: '0.0.0.0:8080'
domains:
  api.anthropic.com:
    headers:
      x-api-key: 'sk-ant-YOUR-REAL-KEY'
```

The `config.yaml` file is gitignored to prevent accidental secret commits.
