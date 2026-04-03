# Plan: Credential Resolution

> Source PRD: `docs/prd-credential-resolution.md`

## Architectural decisions

- **No new routes** — credential resolution happens inside existing session creation flow
- **Resolution order** — `process.env` → built-in credential store → error. Env always wins.
- **Reference syntax** — `$ENV_VAR_NAME` prefix in header values. Literal values pass through unchanged.
- **No schema changes to NetworkConfig** — `DomainCredential.headers` stays `Record<string, string>`. The `$` prefix is a runtime convention, not a type concern.
- **Resolution happens in the control plane** — workers never see `$REFERENCES`, only resolved values. This keeps the worker/proxy code unchanged.
- **Global credential matching** — built-in store credentials map to domains via the existing provider config (`anthropic` → `api.anthropic.com`, `openai` → `api.openai.com`, `github` → `github.com`).

---

## Phase 1: Credential Resolver Core

**User stories**: Self-hoster with OpenBao, Mixed mode

### What to build

A credential resolver that intercepts session creation in the control plane. When `network.credentials` contains header values starting with `$`, resolve them from `process.env` first, then the built-in credential store. If unresolved, reject the session with a clear error message.

The resolver sits between the session creation route and the worker dispatch — the worker receives fully resolved credentials, identical to today's static flow. No changes to the worker, proxy, or dashboard.

End-to-end path: user creates a daemon with `x-api-key: "$ANTHROPIC_API_KEY"` → control plane resolves `$ANTHROPIC_API_KEY` from environment → worker receives `x-api-key: "sk-ant-actual-key"` → proxy injects it → VM never sees it.

### Acceptance criteria

- [ ] Header values starting with `$` are resolved from `process.env`
- [ ] Unresolved `$REFERENCES` where env var is missing fall back to the built-in credential store (match by env var name convention, e.g. `ANTHROPIC_API_KEY` → `anthropic` provider)
- [ ] Unresolved references that match neither source reject the session with error code `CREDENTIAL_NOT_FOUND` and message naming the missing reference
- [ ] Literal header values (no `$` prefix) pass through unchanged
- [ ] Resolution happens before dispatch to worker — workers never see `$` references
- [ ] Unit tests: resolve from env, resolve from store fallback, fail on missing, literal passthrough
- [ ] Integration test: session with `$REF` in daemon config → proxy receives resolved headers

---

## Phase 2: Auto-Injection from Global Credentials

**User stories**: Local developer (dev mode)

### What to build

When a session's `allowOut` includes a domain that matches a globally stored credential (from the setup wizard), automatically inject the credential header — even if the session request doesn't include explicit `network.credentials` for that domain.

This makes the dev-mode flow zero-config: paste a key in the wizard, create a session that allows `api.anthropic.com`, and the key is injected automatically. Explicit `network.credentials` entries override auto-injected ones.

End-to-end path: user pastes Anthropic key in setup wizard → creates session with only `allowOut: ["api.anthropic.com"]` → control plane auto-injects `x-api-key` from store → proxy injects it → works without any credential config in the session request.

### Acceptance criteria

- [ ] Domains in `allowOut` that match a stored credential get auto-injected headers
- [ ] Domain-to-provider matching uses existing provider config (provider → domain mapping)
- [ ] Explicit `network.credentials` entries for a domain override auto-injected ones
- [ ] Auto-injection works alongside `$REFERENCE` resolution (Phase 1)
- [ ] Sessions without `network.credentials` but with matching `allowOut` domains get credentials injected
- [ ] Unit tests: auto-inject from store, explicit override, no injection when no match

---

## Phase 3: Dashboard Polish

**User stories**: All

### What to build

Surface credential resolution status in the dashboard so users understand where their credentials come from and can diagnose issues.

Three changes: (1) In the setup wizard, add a note explaining that production deployments should use environment variables instead of pasting keys. (2) In daemon/session detail views, show the resolution source for each credential ("from environment" / "from credential store" / "auto-injected"). (3) Show clear error states when credential resolution fails, with the specific `$REFERENCE` that couldn't be resolved.

### Acceptance criteria

- [ ] Setup wizard shows production guidance: "In production, set these as environment variables on the control plane"
- [ ] Daemon detail shows credential resolution source per domain
- [ ] Session error states for `CREDENTIAL_NOT_FOUND` display the missing reference name
- [ ] No changes to the setup wizard's core flow (paste keys still works)
