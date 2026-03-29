import { describe, expect, test } from 'vitest';

import { McpServerConfigSchema, McpToolCallSchema, McpToolCallResponseSchema } from './mcp.js';

describe('McpServerConfigSchema', () => {
  test('accepts stdio server', () => {
    const result = McpServerConfigSchema.parse({
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });
    expect(result.name).toBe('filesystem');
    expect(result.transport).toBe('stdio');
    expect(result.command).toBe('npx');
    expect(result.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
  });

  test('accepts sse server', () => {
    const result = McpServerConfigSchema.parse({
      name: 'github',
      transport: 'sse',
      url: 'http://localhost:3001/mcp',
    });
    expect(result.transport).toBe('sse');
    expect(result.url).toBe('http://localhost:3001/mcp');
  });

  test('accepts streamable-http server', () => {
    const result = McpServerConfigSchema.parse({
      name: 'tools',
      transport: 'streamable-http',
      url: 'http://localhost:8080/mcp',
    });
    expect(result.transport).toBe('streamable-http');
  });

  test('accepts env vars', () => {
    const result = McpServerConfigSchema.parse({
      name: 'db',
      transport: 'stdio',
      command: 'mcp-server-postgres',
      env: { DATABASE_URL: 'postgresql://localhost/test' },
    });
    expect(result.env).toEqual({ DATABASE_URL: 'postgresql://localhost/test' });
  });

  test('rejects empty name', () => {
    expect(() =>
      McpServerConfigSchema.parse({ name: '', transport: 'stdio', command: 'test' }),
    ).toThrow();
  });

  test('rejects invalid transport', () => {
    expect(() =>
      McpServerConfigSchema.parse({ name: 'test', transport: 'websocket', command: 'test' }),
    ).toThrow();
  });

  test('rejects invalid url', () => {
    expect(() =>
      McpServerConfigSchema.parse({ name: 'test', transport: 'sse', url: 'not-a-url' }),
    ).toThrow();
  });
});

describe('McpToolCallSchema', () => {
  test('accepts valid tool call', () => {
    const result = McpToolCallSchema.parse({
      server: 'filesystem',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/tmp/test.txt' } },
    });
    expect(result.server).toBe('filesystem');
    expect(result.method).toBe('tools/call');
  });

  test('accepts tool call without params', () => {
    const result = McpToolCallSchema.parse({
      server: 'filesystem',
      method: 'tools/list',
    });
    expect(result.params).toBeUndefined();
  });

  test('rejects empty server name', () => {
    expect(() => McpToolCallSchema.parse({ server: '', method: 'test' })).toThrow();
  });

  test('rejects empty method', () => {
    expect(() => McpToolCallSchema.parse({ server: 'test', method: '' })).toThrow();
  });
});

describe('McpToolCallResponseSchema', () => {
  test('accepts success response', () => {
    const result = McpToolCallResponseSchema.parse({
      success: true,
      result: { content: [{ type: 'text', text: 'hello' }] },
    });
    expect(result.success).toBe(true);
  });

  test('accepts error response', () => {
    const result = McpToolCallResponseSchema.parse({
      success: false,
      error: 'Server not available',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Server not available');
  });
});
