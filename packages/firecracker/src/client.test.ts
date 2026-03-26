import { describe, expect, it } from 'vitest';

import { FirecrackerErrorCode } from './errors.js';
import type { RequestFn } from './types.js';

import { createFirecrackerClient } from './client.js';

function createMockRequest(responses: Array<{ statusCode: number; body: string }>): {
  request: RequestFn;
  calls: Array<{ method: string; path: string; body?: unknown }>;
} {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  let index = 0;
  return {
    request: async (method, path, body) => {
      calls.push({ method, path, body });
      const response = responses[index];
      if (!response) throw new Error(`No mock response for call ${index}`);
      index++;
      return response;
    },
    calls,
  };
}

describe('createFirecrackerClient', () => {
  describe('loadSnapshot', () => {
    it('sends PUT /snapshot/load with config', async () => {
      const { request, calls } = createMockRequest([{ statusCode: 204, body: '' }]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      const result = await client.loadSnapshot({
        snapshot_path: '/tmp/vmstate.snap',
        mem_backend: {
          backend_type: 'File',
          backend_path: '/tmp/memory.snap',
        },
      });

      expect(result.isOk()).toBe(true);
      expect(calls[0]!.method).toBe('PUT');
      expect(calls[0]!.path).toBe('/snapshot/load');
      expect(calls[0]!.body).toEqual({
        snapshot_path: '/tmp/vmstate.snap',
        mem_backend: {
          backend_type: 'File',
          backend_path: '/tmp/memory.snap',
        },
      });
    });

    it('returns SNAPSHOT_LOAD_FAILED on 400', async () => {
      const { request } = createMockRequest([
        { statusCode: 400, body: '{"fault_message":"bad snapshot"}' },
      ]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      const result = await client.loadSnapshot({
        snapshot_path: '/bad',
        mem_backend: { backend_type: 'File', backend_path: '/bad' },
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(FirecrackerErrorCode.SNAPSHOT_LOAD_FAILED);
    });
  });

  describe('resumeVm', () => {
    it('sends PATCH /vm with Resumed state', async () => {
      const { request, calls } = createMockRequest([{ statusCode: 204, body: '' }]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      const result = await client.resumeVm();

      expect(result.isOk()).toBe(true);
      expect(calls[0]!.method).toBe('PATCH');
      expect(calls[0]!.path).toBe('/vm');
      expect(calls[0]!.body).toEqual({ state: 'Resumed' });
    });

    it('returns VM_RESUME_FAILED on error', async () => {
      const { request } = createMockRequest([{ statusCode: 400, body: 'cannot resume' }]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      const result = await client.resumeVm();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(FirecrackerErrorCode.VM_RESUME_FAILED);
    });
  });

  describe('pauseVm', () => {
    it('sends PATCH /vm with Paused state', async () => {
      const { request, calls } = createMockRequest([{ statusCode: 204, body: '' }]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      const result = await client.pauseVm();

      expect(result.isOk()).toBe(true);
      expect(calls[0]!.body).toEqual({ state: 'Paused' });
    });
  });

  describe('getMachineConfig', () => {
    it('parses machine config from response', async () => {
      const { request } = createMockRequest([
        {
          statusCode: 200,
          body: JSON.stringify({ vcpu_count: 2, mem_size_mib: 4096 }),
        },
      ]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      const result = await client.getMachineConfig();

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        vcpu_count: 2,
        mem_size_mib: 4096,
      });
    });
  });

  describe('putDrive', () => {
    it('sends drive config', async () => {
      const { request, calls } = createMockRequest([{ statusCode: 204, body: '' }]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      await client.putDrive({
        drive_id: 'rootfs',
        path_on_host: '/tmp/disk.ext4',
        is_root_device: true,
        is_read_only: false,
      });

      expect(calls[0]!.path).toBe('/drives/rootfs');
    });
  });

  describe('putNetworkInterface', () => {
    it('sends network interface config', async () => {
      const { request, calls } = createMockRequest([{ statusCode: 204, body: '' }]);

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      await client.putNetworkInterface({
        iface_id: 'eth0',
        host_dev_name: 'tap0',
      });

      expect(calls[0]!.path).toBe('/network-interfaces/eth0');
      expect(calls[0]!.body).toEqual({
        iface_id: 'eth0',
        host_dev_name: 'tap0',
      });
    });
  });

  describe('error handling', () => {
    it('wraps network errors as FirecrackerError', async () => {
      const request: RequestFn = async () => {
        throw new Error('ECONNREFUSED');
      };

      const client = createFirecrackerClient('/tmp/fc.sock', { request });
      const result = await client.getMachineConfig();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(FirecrackerErrorCode.API_ERROR);
    });
  });
});
