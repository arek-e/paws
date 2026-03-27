import { describe, expect, test } from 'vitest';

import { createSemaphore } from './semaphore.js';

describe('createSemaphore', () => {
  test('acquires immediately when capacity is available', async () => {
    const sem = createSemaphore(2);
    await sem.acquire();
    expect(sem.running).toBe(1);
    expect(sem.available).toBe(1);
  });

  test('tracks running count correctly', async () => {
    const sem = createSemaphore(3);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.running).toBe(3);
    expect(sem.available).toBe(0);
  });

  test('queues when capacity is exhausted', async () => {
    const sem = createSemaphore(1);
    await sem.acquire();

    let resolved = false;
    const pending = sem.acquire().then(() => {
      resolved = true;
    });

    // Should not resolve yet
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);
    expect(sem.queued).toBe(1);

    // Release allows queued to proceed
    sem.release();
    await pending;
    expect(resolved).toBe(true);
    expect(sem.queued).toBe(0);
  });

  test('throws when queue is full', async () => {
    const sem = createSemaphore(1, 1);
    await sem.acquire();

    // This one goes to queue
    const _pending = sem.acquire();

    // This one should throw — queue is full
    await expect(sem.acquire()).rejects.toThrow('Queue full (1 pending)');

    // Clean up
    sem.release();
    await _pending;
    sem.release();
  });

  test('release decrements running when no queue', async () => {
    const sem = createSemaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.running).toBe(2);

    sem.release();
    expect(sem.running).toBe(1);
    expect(sem.available).toBe(1);
  });

  test('release does not go below zero', () => {
    const sem = createSemaphore(2);
    sem.release();
    expect(sem.running).toBe(0);
  });

  test('FIFO ordering of queued requests', async () => {
    const sem = createSemaphore(1);
    await sem.acquire();

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    const p3 = sem.acquire().then(() => order.push(3));

    expect(sem.queued).toBe(3);

    sem.release();
    await p1;
    sem.release();
    await p2;
    sem.release();
    await p3;

    expect(order).toEqual([1, 2, 3]);
  });

  test('drain rejects all queued requests', async () => {
    const sem = createSemaphore(1);
    await sem.acquire();

    const p1 = sem.acquire();
    const p2 = sem.acquire();

    sem.drain(new Error('shutting down'));

    await expect(p1).rejects.toThrow('shutting down');
    await expect(p2).rejects.toThrow('shutting down');
    expect(sem.queued).toBe(0);

    sem.release();
  });

  test('available is 0 when fully occupied', async () => {
    const sem = createSemaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.available).toBe(0);
  });
});
