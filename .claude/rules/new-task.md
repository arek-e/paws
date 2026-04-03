---
description: Orientation checklist before starting implementation work
globs: ['docs/roadmap.md', 'apps/*/src/**', 'packages/*/src/**']
---

# Before Starting Implementation Work

Orient yourself before writing code:

1. **Check open PRs** — `gh pr list -R arek-e/paws`. Avoid duplicating in-flight work.
2. **Check recent merges** — `gh pr list -R arek-e/paws --state merged -L 10`. Understand established patterns.
3. **Read the roadmap** — `docs/roadmap.md` has task status (⬜ not started, 🟡 in progress, ✅ done).
4. **Read relevant docs** before touching any area:
   - New package/app → `docs/architecture.md`
   - Security (proxy, credentials, networking) → `docs/security.md`
   - Tests → `docs/testing.md`
   - API routes → `docs/api.md`
   - Server/infra → `docs/fc-staging-server.md`
5. **Check existing code** — read package structure before adding to it.

Use sub-agents for research to keep main context clean. Summarize findings before proposing work.

When you see `@docs/foo.md`, read that file on demand — don't inline it into context.
