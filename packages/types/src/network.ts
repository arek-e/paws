import { z } from 'zod';

/** Per-domain credential injection config */
export const DomainCredentialSchema = z.object({
  headers: z.record(z.string(), z.string()),
});

export type DomainCredential = z.infer<typeof DomainCredentialSchema>;

/** Network configuration for a session/daemon */
export const NetworkConfigSchema = z.object({
  /** Allowed outbound domains (supports wildcards like *.github.com) */
  allowOut: z.array(z.string()).default([]),
  /** Per-domain credential injection */
  credentials: z.record(z.string(), DomainCredentialSchema).default({}),
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;

/** /30 subnet allocation for a VM's TAP device */
export const NetworkAllocationSchema = z.object({
  /** TAP device name (e.g. "tap0") */
  tapDevice: z.string(),
  /** Subnet index (0-based, used to compute IPs) */
  subnetIndex: z.number().int().nonnegative(),
  /** Host-side IP (where proxy listens) */
  hostIp: z.string().ip({ version: 'v4' }),
  /** Guest-side IP (VM's address) */
  guestIp: z.string().ip({ version: 'v4' }),
  /** CIDR notation for the /30 subnet */
  subnet: z.string(),
});

export type NetworkAllocation = z.infer<typeof NetworkAllocationSchema>;
