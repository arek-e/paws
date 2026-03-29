# syntax=docker/dockerfile:1

# ─── Stage 1: builder ────────────────────────────────────────────────────────
# Install all deps and build the workspace packages that control-plane depends on.
FROM oven/bun:1.3.9-alpine AS builder

WORKDIR /build

# Copy root manifest files first so layer caching works when only source changes.
COPY package.json bun.lock* ./

# Copy workspace package manifests (needed for bun install to resolve workspace deps).
COPY packages/types/package.json        ./packages/types/package.json
COPY packages/firecracker/package.json  ./packages/firecracker/package.json
COPY packages/proxy/package.json        ./packages/proxy/package.json
COPY packages/scheduler/package.json      ./packages/scheduler/package.json
COPY packages/snapshot-store/package.json ./packages/snapshot-store/package.json
COPY packages/credentials/package.json  ./packages/credentials/package.json
COPY packages/provisioner/package.json  ./packages/provisioner/package.json
COPY apps/control-plane/package.json            ./apps/control-plane/package.json
COPY providers/aws-ec2/package.json     ./providers/aws-ec2/package.json
COPY apps/worker/package.json           ./apps/worker/package.json

# Install all dependencies (including workspace symlinks).
RUN bun install

# Copy source for workspace packages that control-plane depends on.
COPY packages/types/       ./packages/types/
COPY packages/firecracker/ ./packages/firecracker/
COPY packages/proxy/       ./packages/proxy/
COPY packages/scheduler/       ./packages/scheduler/
COPY packages/snapshot-store/  ./packages/snapshot-store/
COPY providers/aws-ec2/        ./providers/aws-ec2/

# Copy control-plane source.
COPY apps/control-plane/ ./apps/control-plane/

# Build control-plane (outputs to apps/control-plane/dist/).
WORKDIR /build/apps/control-plane
RUN bun run build


# ─── Stage 2: runner ─────────────────────────────────────────────────────────
# Minimal image — only the built output and production runtime deps.
FROM oven/bun:1.3.9-alpine AS runner

WORKDIR /app

# Run as non-root.
RUN addgroup -S paws && adduser -S -G paws paws

# Copy root manifest so bun can resolve the runtime.
COPY --from=builder /build/package.json ./package.json

# Copy production node_modules (includes workspace symlinks).
COPY --from=builder /build/node_modules ./node_modules

# Copy workspace packages (control-plane imports @paws/types at runtime via symlink).
COPY --from=builder /build/packages/types/       ./packages/types/
COPY --from=builder /build/packages/firecracker/ ./packages/firecracker/
COPY --from=builder /build/packages/proxy/       ./packages/proxy/
COPY --from=builder /build/packages/scheduler/       ./packages/scheduler/
COPY --from=builder /build/packages/snapshot-store/  ./packages/snapshot-store/
COPY --from=builder /build/providers/aws-ec2/        ./providers/aws-ec2/

# Copy control-plane source (we run from source with bun, not from the dist bundle,
# because bun handles TypeScript natively and the workspace imports resolve
# correctly without a bundler step that would need to inline them).
COPY --from=builder /build/apps/control-plane/ ./apps/control-plane/

USER paws

ARG PAWS_VERSION=0.0.0
ENV PAWS_VERSION=${PAWS_VERSION}
ENV PORT=4000
ENV NODE_ENV=production

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["bun", "run", "apps/control-plane/src/server.ts"]
