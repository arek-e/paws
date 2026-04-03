---
description: Workflow for picking, executing, and completing roadmap items
globs: ['docs/roadmap.md']
---

# Task Workflow

## Picking work

- `docs/roadmap.md` is the single source of truth for what needs doing.
- Pick any ⬜ (not started) item. Tasks can be parallelized when independent.
- Skip 🟡 (in progress) items — another agent is on it. Check open PRs to confirm.
- If your task depends on another, verify the dependency is merged or PR-ready first.

## Before coding

- Mark your task 🟡 in `docs/roadmap.md` and commit that change first.
- Write a brief implementation plan for the PR description.

## While coding

- One roadmap item per PR. Keep scope focused.
- Follow existing patterns — check merged PRs and existing code.
- New package or app? Update `docs/architecture.md`.

## When done

- Mark your task ✅ in `docs/roadmap.md`.
- PR description must cover: what was built, decisions made, deferred work.
- Tests must pass (`bun test` at minimum, `bun run check` if possible).
