import { describe, expect, it } from 'vitest';

import { createMcpServerStore } from './mcp.js';

describe('McpServerStore', () => {
  it('adds and retrieves a server', () => {
    const store = createMcpServerStore();
    store.add({ name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', '@mcp/fs'] });

    const server = store.get('fs');
    expect(server).toBeDefined();
    expect(server!.name).toBe('fs');
    expect(server!.transport).toBe('stdio');
    expect(server!.command).toBe('npx');
  });

  it('lists all servers', () => {
    const store = createMcpServerStore();
    store.add({ name: 'fs', transport: 'stdio', command: 'npx' });
    store.add({ name: 'github', transport: 'sse', url: 'http://localhost:3001/mcp' });

    const servers = store.list();
    expect(servers).toHaveLength(2);
    expect(servers.map((s) => s.name)).toContain('fs');
    expect(servers.map((s) => s.name)).toContain('github');
  });

  it('deletes a server', () => {
    const store = createMcpServerStore();
    store.add({ name: 'fs', transport: 'stdio', command: 'npx' });

    expect(store.delete('fs')).toBe(true);
    expect(store.get('fs')).toBeUndefined();
    expect(store.list()).toHaveLength(0);
  });

  it('returns false when deleting a non-existent server', () => {
    const store = createMcpServerStore();
    expect(store.delete('nope')).toBe(false);
  });

  it('overwrites a server with the same name', () => {
    const store = createMcpServerStore();
    store.add({ name: 'fs', transport: 'stdio', command: 'old' });
    store.add({ name: 'fs', transport: 'stdio', command: 'new' });

    expect(store.get('fs')!.command).toBe('new');
    expect(store.list()).toHaveLength(1);
  });

  it('returns undefined for non-existent server', () => {
    const store = createMcpServerStore();
    expect(store.get('nope')).toBeUndefined();
  });
});
