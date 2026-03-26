import { describe, expect, test } from 'vitest';

import {
  DurationMsSchema,
  IdSchema,
  MetadataSchema,
  NonEmptyStringSchema,
  PortSchema,
  TimestampSchema,
} from './common.js';

describe('IdSchema', () => {
  test('accepts valid UUID v4', () => {
    expect(IdSchema.parse('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });

  test('rejects non-UUID strings', () => {
    expect(() => IdSchema.parse('not-a-uuid')).toThrow();
  });

  test('rejects empty string', () => {
    expect(() => IdSchema.parse('')).toThrow();
  });
});

describe('TimestampSchema', () => {
  test('accepts ISO 8601 datetime', () => {
    expect(TimestampSchema.parse('2026-03-26T10:00:00Z')).toBe('2026-03-26T10:00:00Z');
  });

  test('rejects non-datetime strings', () => {
    expect(() => TimestampSchema.parse('not-a-date')).toThrow();
  });
});

describe('DurationMsSchema', () => {
  test('accepts positive integers', () => {
    expect(DurationMsSchema.parse(5000)).toBe(5000);
  });

  test('rejects zero', () => {
    expect(() => DurationMsSchema.parse(0)).toThrow();
  });

  test('rejects negative', () => {
    expect(() => DurationMsSchema.parse(-1)).toThrow();
  });

  test('rejects floats', () => {
    expect(() => DurationMsSchema.parse(1.5)).toThrow();
  });
});

describe('NonEmptyStringSchema', () => {
  test('accepts non-empty strings', () => {
    expect(NonEmptyStringSchema.parse('hello')).toBe('hello');
  });

  test('trims whitespace', () => {
    expect(NonEmptyStringSchema.parse('  hello  ')).toBe('hello');
  });

  test('rejects empty string', () => {
    expect(() => NonEmptyStringSchema.parse('')).toThrow();
  });

  test('rejects whitespace-only string', () => {
    expect(() => NonEmptyStringSchema.parse('   ')).toThrow();
  });
});

describe('PortSchema', () => {
  test('accepts valid ports', () => {
    expect(PortSchema.parse(8080)).toBe(8080);
    expect(PortSchema.parse(1)).toBe(1);
    expect(PortSchema.parse(65535)).toBe(65535);
  });

  test('rejects port 0', () => {
    expect(() => PortSchema.parse(0)).toThrow();
  });

  test('rejects port above 65535', () => {
    expect(() => PortSchema.parse(65536)).toThrow();
  });
});

describe('MetadataSchema', () => {
  test('accepts record of string to unknown', () => {
    const result = MetadataSchema.parse({ key: 'value', num: 42 });
    expect(result).toEqual({ key: 'value', num: 42 });
  });

  test('accepts empty object', () => {
    expect(MetadataSchema.parse({})).toEqual({});
  });
});
