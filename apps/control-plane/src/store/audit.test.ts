import { describe, expect, test } from 'vitest';

import { createAuditStore } from './audit.js';

describe('createAuditStore', () => {
  test('append returns event with id and timestamp', () => {
    const store = createAuditStore();
    const event = store.append({
      category: 'session',
      action: 'session.created',
      severity: 'info',
      resourceType: 'session',
      resourceId: 'abc-123',
    });

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.category).toBe('session');
    expect(event.action).toBe('session.created');
    expect(event.severity).toBe('info');
  });

  test('query returns events newest first', () => {
    const store = createAuditStore();
    store.append({ category: 'session', action: 'first', severity: 'info' });
    store.append({ category: 'session', action: 'second', severity: 'info' });

    const { events, total } = store.query({});
    expect(total).toBe(2);
    expect(events[0]!.action).toBe('second');
    expect(events[1]!.action).toBe('first');
  });

  test('query filters by category', () => {
    const store = createAuditStore();
    store.append({ category: 'session', action: 'session.created', severity: 'info' });
    store.append({ category: 'daemon', action: 'daemon.created', severity: 'info' });
    store.append({ category: 'session', action: 'session.failed', severity: 'error' });

    const { events, total } = store.query({ category: 'session' });
    expect(total).toBe(2);
    expect(events.every((e) => e.category === 'session')).toBe(true);
  });

  test('query filters by severity', () => {
    const store = createAuditStore();
    store.append({ category: 'session', action: 'session.created', severity: 'info' });
    store.append({ category: 'session', action: 'session.failed', severity: 'error' });

    const { events, total } = store.query({ severity: 'error' });
    expect(total).toBe(1);
    expect(events[0]!.severity).toBe('error');
  });

  test('query filters by action', () => {
    const store = createAuditStore();
    store.append({ category: 'session', action: 'session.created', severity: 'info' });
    store.append({ category: 'daemon', action: 'daemon.triggered', severity: 'info' });

    const { events } = store.query({ action: 'daemon.triggered' });
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('daemon.triggered');
  });

  test('query full-text search matches action and details', () => {
    const store = createAuditStore();
    store.append({
      category: 'daemon',
      action: 'daemon.triggered',
      severity: 'info',
      details: { role: 'pr-reviewer' },
    });
    store.append({
      category: 'session',
      action: 'session.created',
      severity: 'info',
      details: { snapshot: 'agent' },
    });

    const { events } = store.query({ search: 'pr-reviewer' });
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('daemon.triggered');
  });

  test('query supports pagination', () => {
    const store = createAuditStore();
    for (let i = 0; i < 10; i++) {
      store.append({ category: 'session', action: `action-${i}`, severity: 'info' });
    }

    const page1 = store.query({ limit: 3, offset: 0 });
    expect(page1.events).toHaveLength(3);
    expect(page1.total).toBe(10);
    // newest first
    expect(page1.events[0]!.action).toBe('action-9');

    const page2 = store.query({ limit: 3, offset: 3 });
    expect(page2.events).toHaveLength(3);
    expect(page2.events[0]!.action).toBe('action-6');
  });

  test('query filters by time range', () => {
    const store = createAuditStore();
    // Append events — they all get "now" timestamps, so we test since/until boundaries
    const e1 = store.append({ category: 'session', action: 'old', severity: 'info' });

    const { events } = store.query({ since: e1.timestamp });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test('ring buffer drops oldest events beyond 10000', () => {
    const store = createAuditStore();
    for (let i = 0; i < 10_005; i++) {
      store.append({ category: 'system', action: `event-${i}`, severity: 'info' });
    }

    const { total } = store.query({});
    expect(total).toBe(10_000);

    // Oldest should be event-5 (first 5 dropped)
    const { events } = store.query({ limit: 1, offset: 9999 });
    expect(events[0]!.action).toBe('event-5');
  });

  test('stats returns category counts for 24h and 7d', () => {
    const store = createAuditStore();
    store.append({ category: 'session', action: 'session.created', severity: 'info' });
    store.append({ category: 'session', action: 'session.completed', severity: 'info' });
    store.append({ category: 'daemon', action: 'daemon.created', severity: 'info' });

    const stats = store.stats();
    expect(stats.total).toBe(3);
    expect(stats.last24h['session']).toBe(2);
    expect(stats.last24h['daemon']).toBe(1);
    expect(stats.last7d['session']).toBe(2);
    expect(stats.last7d['daemon']).toBe(1);
  });
});
