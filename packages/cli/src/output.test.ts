import { describe, it, expect, vi, beforeEach } from 'vitest';

import { formatOutput, printError } from './output.js';

describe('formatOutput', () => {
  describe('JSON mode (pretty=false)', () => {
    it('formats object as indented JSON', () => {
      const result = formatOutput({ key: 'value' }, false);
      expect(result).toBe(JSON.stringify({ key: 'value' }, null, 2));
    });

    it('formats array as indented JSON', () => {
      const result = formatOutput([1, 2, 3], false);
      expect(result).toBe(JSON.stringify([1, 2, 3], null, 2));
    });

    it('formats string as JSON', () => {
      const result = formatOutput('hello', false);
      expect(result).toBe('"hello"');
    });

    it('formats null as JSON', () => {
      const result = formatOutput(null, false);
      expect(result).toBe('null');
    });
  });

  describe('pretty mode (pretty=true)', () => {
    it('formats object as key-value pairs with padding', () => {
      const result = formatOutput({ name: 'paws', version: '0.1' }, true);
      expect(result).toContain('name');
      expect(result).toContain('paws');
      expect(result).toContain('version');
      expect(result).toContain('0.1');
      // Keys should be padded to align values
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
    });

    it('formats array of objects as table', () => {
      const data = [
        { id: '1', name: 'alice' },
        { id: '2', name: 'bob' },
      ];
      const result = formatOutput(data, true);
      const lines = result.split('\n');
      // Header, separator, 2 data rows
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('name');
      // Separator uses horizontal line character
      expect(lines[1]).toMatch(/─/);
      expect(lines[2]).toContain('1');
      expect(lines[2]).toContain('alice');
      expect(lines[3]).toContain('2');
      expect(lines[3]).toContain('bob');
    });

    it('formats empty array as "(empty)"', () => {
      expect(formatOutput([], true)).toBe('(empty)');
    });

    it('formats array of primitives as newline-separated', () => {
      const result = formatOutput(['a', 'b', 'c'], true);
      expect(result).toBe('a\nb\nc');
    });

    it('formats nested object values as JSON strings', () => {
      const result = formatOutput({ config: { nested: true } }, true);
      expect(result).toContain('{"nested":true}');
    });

    it('formats primitive values as strings', () => {
      expect(formatOutput(42, true)).toBe('42');
      expect(formatOutput(true, true)).toBe('true');
    });
  });
});

describe('printError', () => {
  let stderrData: string;

  beforeEach(() => {
    stderrData = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
      stderrData += String(data);
      return true;
    });
  });

  it('writes error message to stderr with prefix', () => {
    printError('something broke');
    expect(stderrData).toBe('error: something broke\n');
  });

  it('writes error with special characters', () => {
    printError('file "test.ts" not found');
    expect(stderrData).toContain('file "test.ts" not found');
  });
});
