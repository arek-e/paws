import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { ProvidersError, ProvidersErrorCode } from './errors.js';
import type { CreateHostOpts, Host, HostProvider } from './provider.js';
import { createProviderRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHost(id: string, provider: string): Host {
  return {
    id,
    name: `host-${id}`,
    provider,
    status: 'ready',
    ipv4: '1.2.3.4',
    ipv6: null,
    region: 'hel1',
    plan: 'cx31',
    createdAt: new Date('2024-01-01'),
    metadata: {},
  };
}

function makeProvider(name: string): HostProvider {
  return {
    name,
    createHost(_opts: CreateHostOpts) {
      return okAsync(makeHost('new-id', name));
    },
    getHost(hostId: string) {
      return okAsync(makeHost(hostId, name));
    },
    listHosts() {
      return okAsync([makeHost('h1', name), makeHost('h2', name)]);
    },
    deleteHost(_hostId: string) {
      return okAsync(undefined);
    },
  };
}

function makeErrorProvider(name: string): HostProvider {
  return {
    name,
    createHost(_opts: CreateHostOpts) {
      return errAsync(new ProvidersError(ProvidersErrorCode.PROVISION_FAILED, 'boom'));
    },
    getHost(_hostId: string) {
      return errAsync(new ProvidersError(ProvidersErrorCode.HOST_NOT_FOUND, 'not found'));
    },
    listHosts() {
      return errAsync(new ProvidersError(ProvidersErrorCode.API_ERROR, 'api error'));
    },
    deleteHost(_hostId: string) {
      return errAsync(new ProvidersError(ProvidersErrorCode.API_ERROR, 'delete failed'));
    },
  };
}

// ---------------------------------------------------------------------------
// createProviderRegistry — empty state
// ---------------------------------------------------------------------------

describe('createProviderRegistry — empty registry', () => {
  it('returns empty list when no providers registered', () => {
    const registry = createProviderRegistry();
    expect(registry.list()).toEqual([]);
  });

  it('returns null for an unknown provider name', () => {
    const registry = createProviderRegistry();
    expect(registry.get('hetzner-dedicated')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// register + get
// ---------------------------------------------------------------------------

describe('createProviderRegistry — register and get', () => {
  it('retrieves a registered provider by name', () => {
    const registry = createProviderRegistry();
    const provider = makeProvider('hetzner-dedicated');
    registry.register(provider);
    expect(registry.get('hetzner-dedicated')).toBe(provider);
  });

  it('returns null for a different name after registering one provider', () => {
    const registry = createProviderRegistry();
    registry.register(makeProvider('hetzner-dedicated'));
    expect(registry.get('hetzner-cloud')).toBeNull();
  });

  it('overwrites an existing provider with the same name', () => {
    const registry = createProviderRegistry();
    const first = makeProvider('hetzner-dedicated');
    const second = makeProvider('hetzner-dedicated');
    registry.register(first);
    registry.register(second);
    expect(registry.get('hetzner-dedicated')).toBe(second);
  });

  it('keeps both providers when registered under different names', () => {
    const registry = createProviderRegistry();
    const dedicated = makeProvider('hetzner-dedicated');
    const cloud = makeProvider('hetzner-cloud');
    registry.register(dedicated);
    registry.register(cloud);
    expect(registry.get('hetzner-dedicated')).toBe(dedicated);
    expect(registry.get('hetzner-cloud')).toBe(cloud);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('createProviderRegistry — list', () => {
  it('lists a single registered provider', () => {
    const registry = createProviderRegistry();
    const provider = makeProvider('hetzner-dedicated');
    registry.register(provider);
    expect(registry.list()).toEqual([provider]);
  });

  it('lists all registered providers', () => {
    const registry = createProviderRegistry();
    const dedicated = makeProvider('hetzner-dedicated');
    const cloud = makeProvider('hetzner-cloud');
    const latitude = makeProvider('latitude');
    registry.register(dedicated);
    registry.register(cloud);
    registry.register(latitude);
    const listed = registry.list();
    expect(listed).toHaveLength(3);
    expect(listed).toContain(dedicated);
    expect(listed).toContain(cloud);
    expect(listed).toContain(latitude);
  });

  it('reflects overwrite when listing after re-registering same name', () => {
    const registry = createProviderRegistry();
    registry.register(makeProvider('hetzner-dedicated'));
    const replacement = makeProvider('hetzner-dedicated');
    registry.register(replacement);
    const listed = registry.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toBe(replacement);
  });

  it('returns a snapshot — mutation of the returned array does not affect registry', () => {
    const registry = createProviderRegistry();
    registry.register(makeProvider('hetzner-dedicated'));
    const listed = registry.list();
    // Mutate the returned array
    listed.splice(0, 1);
    // Registry should be unaffected
    expect(registry.list()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isolation — multiple independent registries
// ---------------------------------------------------------------------------

describe('createProviderRegistry — registry isolation', () => {
  it('two registries are independent', () => {
    const r1 = createProviderRegistry();
    const r2 = createProviderRegistry();
    r1.register(makeProvider('hetzner-dedicated'));
    expect(r2.get('hetzner-dedicated')).toBeNull();
    expect(r2.list()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// provider interface — error provider works through registry
// ---------------------------------------------------------------------------

describe('createProviderRegistry — error propagation through registry', () => {
  it('provider errors pass through correctly when retrieved from registry', async () => {
    const registry = createProviderRegistry();
    registry.register(makeErrorProvider('bad-provider'));
    const provider = registry.get('bad-provider');
    expect(provider).not.toBeNull();

    const result = await provider!.getHost('h1');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(ProvidersErrorCode.HOST_NOT_FOUND);
    }
  });
});
