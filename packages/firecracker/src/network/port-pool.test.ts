import { describe, expect, it } from 'vitest';

import { createPortPool } from './port-pool.js';

describe('createPortPool', () => {
  it('allocates requested number of ports', () => {
    const pool = createPortPool(10000, 10100);
    const result = pool.allocate(3);
    expect(result.isOk()).toBe(true);
    const ports = result._unsafeUnwrap();
    expect(ports).toHaveLength(3);
    expect(ports[0]).toBe(10000);
    expect(ports[1]).toBe(10001);
    expect(ports[2]).toBe(10002);
  });

  it('tracks allocated count', () => {
    const pool = createPortPool(10000, 10100);
    expect(pool.size).toBe(0);
    expect(pool.available).toBe(101); // 10000-10100 inclusive

    pool.allocate(5);
    expect(pool.size).toBe(5);
    expect(pool.available).toBe(96);
  });

  it('does not return duplicate ports', () => {
    const pool = createPortPool(10000, 10010);
    const r1 = pool.allocate(3)._unsafeUnwrap();
    const r2 = pool.allocate(3)._unsafeUnwrap();

    const allPorts = [...r1, ...r2];
    expect(new Set(allPorts).size).toBe(6);
    expect(r2[0]).toBe(10003);
  });

  it('releases ports for reuse', () => {
    const pool = createPortPool(10000, 10010);
    const r1 = pool.allocate(3)._unsafeUnwrap();
    expect(r1).toEqual([10000, 10001, 10002]);

    pool.release([10000, 10001]);
    expect(pool.size).toBe(1);
    expect(pool.available).toBe(10);

    // Released ports are reused (prefers lower ports)
    const r2 = pool.allocate(2)._unsafeUnwrap();
    expect(r2).toEqual([10000, 10001]);
  });

  it('errors when pool is exhausted', () => {
    const pool = createPortPool(10000, 10002); // only 3 ports
    pool.allocate(3);
    const result = pool.allocate(1);
    expect(result.isErr()).toBe(true);
  });

  it('errors when requesting more ports than available', () => {
    const pool = createPortPool(10000, 10002);
    const result = pool.allocate(5);
    expect(result.isErr()).toBe(true);
  });

  it('errors on zero or negative count', () => {
    const pool = createPortPool(10000, 10100);
    expect(pool.allocate(0).isErr()).toBe(true);
    expect(pool.allocate(-1).isErr()).toBe(true);
  });

  it('wraps around when reaching max port', () => {
    const pool = createPortPool(10000, 10004); // 5 ports
    pool.allocate(4); // allocates 10000-10003
    pool.release([10000, 10001]); // free up low ports

    // release sets nextCandidate to 10000 (lowest released)
    const r = pool.allocate(3)._unsafeUnwrap();
    expect(r).toEqual([10000, 10001, 10004]);
  });
});
