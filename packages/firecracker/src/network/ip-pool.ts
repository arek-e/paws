import type { NetworkAllocation } from '@paws/domain-network';

import { err, ok } from 'neverthrow';
import type { Result } from 'neverthrow';

import { FirecrackerError, FirecrackerErrorCode } from '../errors.js';

/** Firecracker-specific network allocation with TAP device */
export interface FirecrackerAllocation extends NetworkAllocation {
  tapDevice: string;
}

/**
 * Base network for VM subnets: 172.16.0.0/16
 * Each VM gets a /30 subnet with 4 addresses:
 *   - .0 = network address
 *   - .1 = host (proxy listener)
 *   - .2 = guest (VM)
 *   - .3 = broadcast
 *
 * Subnets are packed sequentially in the last two octets:
 *   index 0: 172.16.0.0/30  (host .1, guest .2)
 *   index 1: 172.16.0.4/30  (host .5, guest .6)
 *   index 63: 172.16.0.252/30
 *   index 64: 172.16.1.0/30
 *
 * Max: 16384 concurrent VMs (2^16 / 4)
 */
const BASE_OCTET_1 = 172;
const BASE_OCTET_2 = 16;
const ADDRESSES_PER_SUBNET = 4;
const MAX_SUBNET_INDEX = 16383; // (256 * 256 / 4) - 1

/** Compute the 3rd and 4th octet from a flat byte offset */
function offsetToOctets(offset: number): [number, number] {
  const octet3 = (offset >>> 8) & 0xff;
  const octet4 = offset & 0xff;
  return [octet3, octet4];
}

/** Allocate a /30 subnet for the given index */
export function allocateSubnet(index: number): Result<FirecrackerAllocation, FirecrackerError> {
  if (!Number.isInteger(index) || index < 0 || index > MAX_SUBNET_INDEX) {
    return err(
      new FirecrackerError(
        FirecrackerErrorCode.IP_POOL_EXHAUSTED,
        `Subnet index ${index} out of range (0-${MAX_SUBNET_INDEX})`,
      ),
    );
  }

  const baseOffset = index * ADDRESSES_PER_SUBNET;
  const [net3, net4] = offsetToOctets(baseOffset);
  const [host3, host4] = offsetToOctets(baseOffset + 1);
  const [guest3, guest4] = offsetToOctets(baseOffset + 2);

  return ok({
    tapDevice: `tap${index}`,
    subnetIndex: index,
    hostIp: `${BASE_OCTET_1}.${BASE_OCTET_2}.${host3}.${host4}`,
    guestIp: `${BASE_OCTET_1}.${BASE_OCTET_2}.${guest3}.${guest4}`,
    subnet: `${BASE_OCTET_1}.${BASE_OCTET_2}.${net3}.${net4}/30`,
  });
}

/**
 * Simple in-memory IP pool that tracks allocated subnet indices.
 * The worker maintains one pool instance and allocates/releases as VMs start/stop.
 */
export function createIpPool(maxSlots: number = MAX_SUBNET_INDEX + 1) {
  const allocated = new Set<number>();
  let nextCandidate = 0;

  return {
    /** Allocate the next available subnet */
    allocate(): Result<FirecrackerAllocation, FirecrackerError> {
      if (allocated.size >= maxSlots) {
        return err(
          new FirecrackerError(
            FirecrackerErrorCode.IP_POOL_EXHAUSTED,
            `IP pool exhausted (${maxSlots} slots)`,
          ),
        );
      }

      // Find next free index
      while (allocated.has(nextCandidate)) {
        nextCandidate = (nextCandidate + 1) % (MAX_SUBNET_INDEX + 1);
      }

      const index = nextCandidate;
      allocated.add(index);
      nextCandidate = (index + 1) % (MAX_SUBNET_INDEX + 1);

      return allocateSubnet(index);
    },

    /** Release a previously allocated subnet */
    release(index: number): void {
      allocated.delete(index);
      // Prefer reusing lower indices to keep allocation dense
      if (index < nextCandidate) {
        nextCandidate = index;
      }
    },

    /** Number of currently allocated subnets */
    get size(): number {
      return allocated.size;
    },

    /** Number of available slots */
    get available(): number {
      return maxSlots - allocated.size;
    },
  };
}
