# PRD: Credential Resolution

```
 /\_/\
( o.o )  secrets stay outside
 > ^ <
```

## Problem

paws has a credential store (`packages/credentials/`) that encrypts and holds API keys in memory.
Users paste keys into the setup wizard. This works for local dev but breaks down in production:

1. **No reference syntax** — daemon configs can't reference stored credentials. You must hardcode
   headers in each session request's `network.credentials[domain]`.
2. **Duplicate source of truth** — production users already have secrets in OpenBao, 1Password,
   Infisical, or env vars. Copying them into paws creates drift and rotation problems.
3. **No auto-injection** — even globally stored credentials aren't automatically used by sessions.
   Every session request must explicitly pass credential headers.

## Goals

1. Daemon configs reference credentials by name (`$ANTHROPIC_API_KEY`), not by value
2. Control plane resolves references at session start from environment variables
3. Built-in credential store becomes "dev mode" — paste keys in the dashboard for local use
4. Production users bring their own secret plumbing (K8s Secrets, ExternalSecrets, env vars)
5. Zero new external dependencies — paws doesn't need SDKs for Vault/1Password/Infisical

## Non-Goals

- Building N secret manager adapters (1Password, Vault, Infisical, Doppler, AWS SSM)
- Replacing the existing credential store (it stays for dev mode)
- Secret rotation orchestration (user's infra handles this)
- UI for managing external secret backends

## Design

### Credential Reference Syntax

Daemon and session configs use `$ENV_VAR_NAME` to reference credentials:

```yaml
# Daemon config
network:
  allowOut:
    - api.anthropic.com
    - github.com
  credentials:
    api.anthropic.com:
      headers:
        x-api-key: '$ANTHROPIC_API_KEY'
    github.com:
      headers:
        Authorization: 'Bearer $GITHUB_TOKEN'
```

At session start, the control plane resolves `$ANTHROPIC_API_KEY` → actual value before passing
the config to the worker.

### Resolution Order

When the control plane encounters a `$REFERENCE`:

1. **Environment variables** — `process.env[REFERENCE]` (covers K8s Secrets, ExternalSecrets,
   Infisical agent, 1Password CLI, docker --env-file, systemd EnvironmentFile)
2. **Built-in credential store** — fall back to the in-memory encrypted store (dev mode)
3. **Fail loudly** — if unresolved, reject the session with a clear error: "Credential
   $ANTHROPIC_API_KEY not found in environment or credential store"

### Auto-Injection from Global Credentials

When a session's `network.allowOut` includes a domain that matches a globally stored credential
(from the setup wizard), auto-inject it without requiring explicit `network.credentials` config:

```
Session allows: api.anthropic.com
Global credential exists: anthropic → { headerName: "x-api-key", value: "sk-ant-..." }
→ Auto-inject x-api-key header for api.anthropic.com
```

Explicit `network.credentials` entries override auto-injected ones.

### Dev Mode vs Production Mode

| Aspect             | Dev Mode                    | Production Mode                               |
| ------------------ | --------------------------- | --------------------------------------------- |
| How secrets get in | Paste in dashboard wizard   | Env vars (K8s Secrets, ExternalSecrets, etc.) |
| Storage            | In-memory encrypted store   | process.env (managed by user's infra)         |
| Reference syntax   | Works (falls back to store) | Works (reads env vars)                        |
| Auto-injection     | Works (from store)          | Works (from env + store)                      |
| Rotation           | Manual (re-paste in UI)     | Automatic (user's secret manager handles it)  |
| Who manages        | User via dashboard          | User's infra team via their existing tooling  |

No explicit mode toggle — both resolution sources are always active, env vars take priority.

### What Changes

#### 1. Credential resolver (new)

```typescript
// packages/credentials/src/resolver.ts

export function createCredentialResolver(store: CredentialStore) {
  return {
    resolve(value: string): string {
      if (!value.startsWith('$')) return value; // literal value, pass through
      const ref = value.slice(1); // strip $

      // 1. Check environment
      const envValue = process.env[ref];
      if (envValue) return envValue;

      // 2. Check built-in store
      const stored = store.getByEnvName(ref);
      if (stored) return stored.value;

      // 3. Fail
      throw new CredentialError('UNRESOLVED', `Credential $${ref} not found`);
    },

    resolveNetworkConfig(network: NetworkConfig): ResolvedNetworkConfig {
      // Resolve all $REFERENCES in network.credentials headers
      // Auto-inject global credentials for allowlisted domains
    },
  };
}
```

#### 2. Control plane session creation

Before dispatching to worker, resolve all credential references:

```typescript
// apps/control-plane/src/routes/sessions.ts (modified)

const resolved = credentialResolver.resolveNetworkConfig(request.network);
// Pass resolved (actual values) to worker, not the references
```

#### 3. Domain type updates

`DomainCredential` headers can now contain `$REFERENCES`:

```typescript
// No schema change needed — headers are Record<string, string>
// The $ prefix is a runtime convention, not a type-level concern
```

#### 4. Auto-injection logic

```typescript
// packages/credentials/src/resolver.ts

function autoInjectGlobalCredentials(
  allowOut: string[],
  explicitCredentials: Record<string, DomainCredential>,
  store: CredentialStore,
): Record<string, DomainCredential> {
  const result = { ...explicitCredentials };

  for (const domain of allowOut) {
    if (result[domain]) continue; // explicit config wins
    const match = store.findByDomain(domain);
    if (match) {
      result[domain] = { headers: { [match.headerName]: match.value } };
    }
  }

  return result;
}
```

#### 5. Credential store additions

Add lookup methods to support auto-injection:

- `store.findByDomain(domain)` — match a domain to a stored credential (e.g., `api.anthropic.com` → anthropic provider)
- `store.getByEnvName(ref)` — look up by conventional env var name (e.g., `ANTHROPIC_API_KEY` → anthropic credential)

#### 6. Dashboard updates

- Setup wizard stays as-is (paste keys for dev mode)
- Add a note: "In production, set these as environment variables on the control plane instead"
- Show resolution source in daemon detail: "anthropic: from environment" vs "anthropic: from credential store"

## User Stories

### Self-hoster with OpenBao (production)

1. User has OpenBao with API keys stored at `ops/ANTHROPIC_API_KEY`
2. ExternalSecrets syncs to K8s Secret, mounted as env var on control plane pod
3. User creates daemon with `x-api-key: "$ANTHROPIC_API_KEY"` in credential config
4. paws resolves from `process.env.ANTHROPIC_API_KEY` at session start
5. Proxy injects the real key — VM never sees it
6. When user rotates the key in OpenBao, ExternalSecrets syncs, control plane picks it up

### Local developer (dev mode)

1. User runs `bun run start`, opens dashboard
2. Pastes Anthropic key in setup wizard
3. Creates a session with `allowOut: ["api.anthropic.com"]`
4. paws auto-injects the stored key (no explicit credential config needed)
5. Works immediately, no env vars needed

### Mixed mode

1. Some credentials in env vars (production keys for CI)
2. Some credentials in built-in store (personal dev keys)
3. Env vars take priority — production keys win when both exist

## Testing

- Unit: credential resolver resolves `$REF` from env, falls back to store, fails on missing
- Unit: auto-injection matches domains to stored credentials
- Unit: explicit credentials override auto-injected ones
- Integration: end-to-end session with `$REF` in daemon config resolves and injects correctly

## Out of Scope (future)

- Hot-reload proxy credentials on rotation (currently requires new session)
- UI for browsing/managing env-sourced credentials
- Audit log entries for credential resolution
- Per-daemon credential scoping (all credentials currently global)
