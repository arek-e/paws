# syntax=docker/dockerfile:1
# /\_/\
# ( o.o )  paws control plane (standalone, no dashboard)
#  > ^ <

# ── Stage 1: install ───────────────────────────────────────────────────────
FROM oven/bun:1.3.9-alpine AS builder

WORKDIR /build

# Install build deps for native modules (better-sqlite3 needs python3 + make + g++)
RUN apk add --no-cache python3 make g++

# Copy entire repo (filtered by .dockerignore — no tests, docs, node_modules).
COPY . .

RUN bun install --frozen-lockfile || bun install

# ── Stage 2: runner ────────────────────────────────────────────────────────
FROM oven/bun:1.3.9-alpine AS runner

WORKDIR /app

RUN addgroup -S paws && adduser -S -G paws paws \
    && mkdir -p /var/lib/paws/data && chown -R paws:paws /var/lib/paws

# Copy built workspace from builder.
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/packages/ ./packages/
COPY --from=builder /build/providers/ ./providers/
COPY --from=builder /build/apps/control-plane/ ./apps/control-plane/

USER paws

ARG PAWS_VERSION=0.0.0
ARG PAWS_COMMIT=unknown
ARG PAWS_BUILD_DATE=unknown
ENV PAWS_VERSION=${PAWS_VERSION}
ENV PAWS_COMMIT=${PAWS_COMMIT}
ENV PAWS_BUILD_DATE=${PAWS_BUILD_DATE}
ENV PORT=4000
ENV NODE_ENV=production

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["bun", "run", "apps/control-plane/src/server.ts"]
