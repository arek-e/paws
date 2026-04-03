import { describe, expect, test } from 'vitest';

import { DaemonId, SessionId, SnapshotId, WorkerId } from './ids.js';

describe('branded IDs', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  describe('SessionId', () => {
    test('accepts a valid UUID', () => {
      const result = SessionId.safeParse(validUuid);
      expect(result.success).toBe(true);
    });

    test('rejects a non-UUID string', () => {
      const result = SessionId.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
    });

    test('rejects an empty string', () => {
      const result = SessionId.safeParse('');
      expect(result.success).toBe(false);
    });

    test('parsed value is a string at runtime', () => {
      const id = SessionId.parse(validUuid);
      expect(typeof id).toBe('string');
      expect(id).toBe(validUuid);
    });
  });

  describe('DaemonId', () => {
    test('accepts a valid UUID', () => {
      expect(DaemonId.safeParse(validUuid).success).toBe(true);
    });

    test('rejects invalid input', () => {
      expect(DaemonId.safeParse(123).success).toBe(false);
    });
  });

  describe('WorkerId', () => {
    test('accepts a valid UUID', () => {
      expect(WorkerId.safeParse(validUuid).success).toBe(true);
    });

    test('rejects null', () => {
      expect(WorkerId.safeParse(null).success).toBe(false);
    });
  });

  describe('SnapshotId', () => {
    test('accepts a non-empty string (not required to be UUID)', () => {
      expect(SnapshotId.safeParse('my-snapshot').success).toBe(true);
    });

    test('accepts a UUID', () => {
      expect(SnapshotId.safeParse(validUuid).success).toBe(true);
    });

    test('rejects an empty string', () => {
      expect(SnapshotId.safeParse('').success).toBe(false);
    });
  });
});
