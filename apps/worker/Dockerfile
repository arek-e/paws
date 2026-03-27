# syntax=docker/dockerfile:1

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM oven/bun:1.3.9-alpine AS builder

WORKDIR /build

# Copy root manifest files first so layer caching works when only source changes.
COPY package.json bun.lock* ./

# Copy workspace package manifests.
COPY packages/types/package.json        ./packages/types/package.json
COPY packages/firecracker/package.json  ./packages/firecracker/package.json
COPY packages/proxy/package.json        ./packages/proxy/package.json
COPY packages/scheduler/package.json    ./packages/scheduler/package.json
COPY apps/gateway/package.json          ./apps/gateway/package.json
COPY apps/worker/package.json           ./apps/worker/package.json

# Install all dependencies.
RUN bun install --frozen-lockfile

# Copy workspace package sources.
COPY packages/types/       ./packages/types/
COPY packages/firecracker/ ./packages/firecracker/
COPY packages/proxy/       ./packages/proxy/
COPY packages/scheduler/   ./packages/scheduler/

# Copy worker source.
COPY apps/worker/ ./apps/worker/

# Build worker (outputs to apps/worker/dist/).
WORKDIR /build/apps/worker
RUN bun run build


# ─── Stage 2: runner ─────────────────────────────────────────────────────────
# The worker needs:
#   - iptables / ip (iproute2) for per-VM network isolation
#   - firecracker binary (must be supplied at /usr/local/bin/firecracker)
#   - access to /dev/kvm (privileged container or --device /dev/kvm)
#   - root or CAP_NET_ADMIN + CAP_SYS_ADMIN for TAP devices and iptables
#
# We use debian-slim rather than alpine because iptables on alpine has known
# compatibility issues with iptables-legacy vs nft that can break DNAT rules.
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

# Copy built workspace artifacts from builder.
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/packages/types/       ./packages/types/
COPY --from=builder /build/packages/firecracker/ ./packages/firecracker/
COPY --from=builder /build/packages/proxy/       ./packages/proxy/
COPY --from=builder /build/packages/scheduler/   ./packages/scheduler/
COPY --from=builder /build/apps/worker/ ./apps/worker/

# Create directories that the worker uses at runtime.
# The actual snapshot/VM data is expected to be mounted via volumes.
RUN mkdir -p /var/lib/paws/snapshots /var/lib/paws/vms /var/lib/paws/ssh

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
