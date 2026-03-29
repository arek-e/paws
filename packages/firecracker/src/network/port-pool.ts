import { err, ok } from 'neverthrow';
import type { Result } from 'neverthrow';

import { FirecrackerError, FirecrackerErrorCode } from '../errors.js';

const DEFAULT_MIN_PORT = 10_000;
const DEFAULT_MAX_PORT = 60_000;

/**
 * Simple in-memory port pool that tracks allocated host ports for inbound
 * port forwarding. Each session can reserve one or more host ports that
 * DNAT to the VM's guest ports.
 */
export function createPortPool(
  minPort: number = DEFAULT_MIN_PORT,
  maxPort: number = DEFAULT_MAX_PORT,
) {
  const allocated = new Set<number>();
  let nextCandidate = minPort;

  return {
    /**
     * Allocate `count` contiguous-ish host ports.
     * Returns an array of allocated port numbers.
     */
    allocate(count: number): Result<number[], FirecrackerError> {
      if (count <= 0) {
        return err(
          new FirecrackerError(
            FirecrackerErrorCode.IP_POOL_EXHAUSTED,
            `Invalid port count: ${count}`,
          ),
        );
      }

      const totalAvailable = maxPort - minPort + 1 - allocated.size;
      if (count > totalAvailable) {
        return err(
          new FirecrackerError(
            FirecrackerErrorCode.IP_POOL_EXHAUSTED,
            `Not enough ports available (need ${count}, have ${totalAvailable})`,
          ),
        );
      }

      const ports: number[] = [];
      for (let i = 0; i < count; i++) {
        // Find next free port
        while (allocated.has(nextCandidate)) {
          nextCandidate++;
          if (nextCandidate > maxPort) nextCandidate = minPort;
        }
        ports.push(nextCandidate);
        allocated.add(nextCandidate);
        nextCandidate++;
        if (nextCandidate > maxPort) nextCandidate = minPort;
      }

      return ok(ports);
    },

    /** Release previously allocated ports (ignores ports not in range or not allocated) */
    release(ports: number[]): void {
      for (const port of ports) {
        if (port < minPort || port > maxPort || !allocated.has(port)) continue;
        allocated.delete(port);
        if (port < nextCandidate) {
          nextCandidate = port;
        }
      }
    },

    /** Number of currently allocated ports */
    get size(): number {
      return allocated.size;
    },

    /** Number of available ports */
    get available(): number {
      return maxPort - minPort + 1 - allocated.size;
    },
  };
}

export type PortPool = ReturnType<typeof createPortPool>;
