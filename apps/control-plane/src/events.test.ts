import { describe, it, expect, vi } from 'vitest';

import { createSessionEvents } from './events.js';

describe('createSessionEvents', () => {
  it('notifies listeners on emit', () => {
    const events = createSessionEvents();
    const listener = vi.fn();

    events.on('update', listener);
    events.emit('update', 'session-1', {
      sessionId: 'session-1',
      status: 'running',
      request: { snapshot: 'test', workload: { type: 'script', script: 'echo' } },
    } as any);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ status: 'running' }),
    );
  });

  it('notifies multiple listeners', () => {
    const events = createSessionEvents();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    events.on('update', listener1);
    events.on('update', listener2);
    events.emit('update', 's1', { sessionId: 's1', status: 'completed' } as any);

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('removes listener with off', () => {
    const events = createSessionEvents();
    const listener = vi.fn();

    events.on('update', listener);
    events.off('update', listener);
    events.emit('update', 's1', { sessionId: 's1', status: 'running' } as any);

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not break other listeners if one throws', () => {
    const events = createSessionEvents();
    const badListener = vi.fn(() => {
      throw new Error('listener failed');
    });
    const goodListener = vi.fn();

    events.on('update', badListener);
    events.on('update', goodListener);
    events.emit('update', 's1', { sessionId: 's1', status: 'running' } as any);

    expect(badListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('does nothing when emitting with no listeners', () => {
    const events = createSessionEvents();
    // Should not throw
    expect(() => {
      events.emit('update', 's1', { sessionId: 's1', status: 'running' } as any);
    }).not.toThrow();
  });

  it('does not add duplicate listeners (Set behavior)', () => {
    const events = createSessionEvents();
    const listener = vi.fn();

    events.on('update', listener);
    events.on('update', listener);
    events.emit('update', 's1', { sessionId: 's1', status: 'running' } as any);

    // Set deduplicates — listener should be called once
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('passes sessionId and session data to listener', () => {
    const events = createSessionEvents();
    const listener = vi.fn();
    const sessionData = {
      sessionId: 'abc-123',
      status: 'failed',
      exitCode: 1,
      request: { snapshot: 'test', workload: { type: 'script', script: 'x' } },
    } as any;

    events.on('update', listener);
    events.emit('update', 'abc-123', sessionData);

    expect(listener).toHaveBeenCalledWith('abc-123', sessionData);
  });
});
