import { describe, expect, it } from 'vitest';

import { FirecrackerErrorCode } from '../errors.js';

import { allocateSubnet, createIpPool } from './ip-pool.js';

describe('allocateSubnet', () => {
  it('allocates index 0 correctly', () => {
    const result = allocateSubnet(0);
    expect(result.isOk()).toBe(true);
    const alloc = result._unsafeUnwrap();
    expect(alloc).toEqual({
      tapDevice: 'tap0',
      subnetIndex: 0,
      hostIp: '172.16.0.1',
      guestIp: '172.16.0.2',
      subnet: '172.16.0.0/30',
    });
  });

  it('allocates index 1 correctly', () => {
    const alloc = allocateSubnet(1)._unsafeUnwrap();
    expect(alloc.hostIp).toBe('172.16.0.5');
    expect(alloc.guestIp).toBe('172.16.0.6');
    expect(alloc.subnet).toBe('172.16.0.4/30');
    expect(alloc.tapDevice).toBe('tap1');
  });

  it('allocates index 63 (last in first /24)', () => {
    const alloc = allocateSubnet(63)._unsafeUnwrap();
    expect(alloc.hostIp).toBe('172.16.0.253');
    expect(alloc.guestIp).toBe('172.16.0.254');
    expect(alloc.subnet).toBe('172.16.0.252/30');
  });

  it('allocates index 64 (first in second /24)', () => {
    const alloc = allocateSubnet(64)._unsafeUnwrap();
    expect(alloc.hostIp).toBe('172.16.1.1');
    expect(alloc.guestIp).toBe('172.16.1.2');
    expect(alloc.subnet).toBe('172.16.1.0/30');
  });

  it('allocates max index 16383', () => {
    const alloc = allocateSubnet(16383)._unsafeUnwrap();
    expect(alloc.hostIp).toBe('172.16.255.253');
    expect(alloc.guestIp).toBe('172.16.255.254');
    expect(alloc.subnet).toBe('172.16.255.252/30');
    expect(alloc.tapDevice).toBe('tap16383');
  });

  it('rejects negative index', () => {
    const result = allocateSubnet(-1);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(FirecrackerErrorCode.IP_POOL_EXHAUSTED);
  });

  it('rejects index above max', () => {
    const result = allocateSubnet(16384);
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-integer index', () => {
    const result = allocateSubnet(1.5);
    expect(result.isErr()).toBe(true);
  });

  it('generates unique IPs for sequential indices', () => {
    const ips = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const alloc = allocateSubnet(i)._unsafeUnwrap();
      expect(ips.has(alloc.hostIp)).toBe(false);
      expect(ips.has(alloc.guestIp)).toBe(false);
      ips.add(alloc.hostIp);
      ips.add(alloc.guestIp);
    }
  });
});

describe('createIpPool', () => {
  it('allocates sequentially', () => {
    const pool = createIpPool(5);
    const a1 = pool.allocate()._unsafeUnwrap();
    const a2 = pool.allocate()._unsafeUnwrap();
    expect(a1.subnetIndex).toBe(0);
    expect(a2.subnetIndex).toBe(1);
  });

  it('tracks size and available', () => {
    const pool = createIpPool(3);
    expect(pool.size).toBe(0);
    expect(pool.available).toBe(3);

    pool.allocate();
    expect(pool.size).toBe(1);
    expect(pool.available).toBe(2);
  });

  it('returns error when exhausted', () => {
    const pool = createIpPool(2);
    pool.allocate();
    pool.allocate();
    const result = pool.allocate();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(FirecrackerErrorCode.IP_POOL_EXHAUSTED);
  });

  it('reuses released indices', () => {
    const pool = createIpPool(2);
    const a1 = pool.allocate()._unsafeUnwrap();
    pool.allocate();

    pool.release(a1.subnetIndex);
    expect(pool.available).toBe(1);

    const a3 = pool.allocate()._unsafeUnwrap();
    expect(a3.subnetIndex).toBe(0);
  });

  it('release is idempotent', () => {
    const pool = createIpPool(2);
    pool.allocate();
    expect(pool.size).toBe(1);

    pool.release(0);
    pool.release(0);
    expect(pool.size).toBe(0);
  });
});
