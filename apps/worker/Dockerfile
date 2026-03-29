# syntax=docker/dockerfile:1
# /\_/\
# ( o.o )  paws worker — Firecracker VM execution
#  > ^ <

# ── Stage 1: install + build ───────────────────────────────────────────────
FROM oven/bun:1.3.9-alpine AS builder

WORKDIR /build

# Install build deps for native modules (better-sqlite3 needs python3 + make + g++)
RUN apk add --no-cache python3 make g++

# Copy entire repo (filtered by .dockerignore — no tests, docs, node_modules).
COPY . .

RUN bun install --frozen-lockfile || bun install

# ── Stage 2: runner ────────────────────────────────────────────────────────
# Debian-slim for iptables compatibility (Alpine has nft issues with DNAT).
# Worker needs: iptables, iproute2, openssh-client, /dev/kvm access.
FROM debian:bookworm-slim AS runner

WORKDIR /app

# Install runtime system dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends \
      iproute2 \
      iptables \
      openssh-client \
      wget \
    && rm -rf /var/lib/apt/lists/*

# Install bun into the runner stage.
COPY --from=oven/bun:1.3.9 /usr/local/bin/bun /usr/local/bin/bun

# Copy built workspace from builder.
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/packages/ ./packages/
COPY --from=builder /build/providers/ ./providers/
COPY --from=builder /build/apps/worker/ ./apps/worker/

# Create directories for runtime data (actual data mounted via volumes).
RUN mkdir -p /var/lib/paws/snapshots /var/lib/paws/vms /var/lib/paws/ssh

ARG PAWS_VERSION=0.0.0
ARG PAWS_COMMIT=unknown
ARG PAWS_BUILD_DATE=unknown
ENV PAWS_VERSION=${PAWS_VERSION}
ENV PAWS_COMMIT=${PAWS_COMMIT}
ENV PAWS_BUILD_DATE=${PAWS_BUILD_DATE}
ENV PORT=3000
ENV NODE_ENV=production
ENV SNAPSHOT_DIR=/var/lib/paws/snapshots/agent-latest
ENV VM_BASE_DIR=/var/lib/paws/vms
ENV SSH_KEY_PATH=/var/lib/paws/ssh/id_ed25519

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Worker must run as root: needs iptables, TAP device creation, KVM access.
CMD ["bun", "run", "apps/worker/src/server.ts"]
