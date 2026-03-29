import { z } from 'zod';

/** Per-domain credential injection config */
export const DomainCredentialSchema = z.object({
  headers: z.record(z.string(), z.string()),
});

export type DomainCredential = z.infer<typeof DomainCredentialSchema>;

/** Access control mode for an exposed port */
export const PortAccessSchema = z.enum(['sso', 'pin', 'email']).default('sso');

export type PortAccess = z.infer<typeof PortAccessSchema>;

/** Port to expose publicly from the VM via Pangolin tunnel */
export const PortExposureSchema = z.object({
  /** Port inside the VM to expose */
  port: z.number().int().min(1).max(65535),
  /** Protocol (default: http) */
  protocol: z.enum(['http', 'https']).default('http'),
  /** Human-readable label (e.g., "Next.js dev server") */
  label: z.string().optional(),
  /** Access control mode (default: sso — Pangolin login required) */
  access: PortAccessSchema.optional(),
  /** Email whitelist — only used when access is 'email' (e.g., ["*@company.com", "user@example.com"]) */
  allowedEmails: z.array(z.string()).optional(),
});

export type PortExposure = z.infer<typeof PortExposureSchema>;

/** Network configuration for a session/daemon */
export const NetworkConfigSchema = z.object({
  /** Allowed outbound domains (supports wildcards like *.github.com) */
  allowOut: z.array(z.string()).default([]),
  /** Per-domain credential injection */
  credentials: z.record(z.string(), DomainCredentialSchema).default({}),
  /** Ports to expose publicly via Pangolin tunnel */
  expose: z.array(PortExposureSchema).default([]),
  /** MCP servers this session/daemon can access (by name) */
  mcp: z.object({ servers: z.array(z.string()) }).optional(),
});

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;

/** /30 subnet allocation for a VM's TAP device */
export const NetworkAllocationSchema = z.object({
  /** TAP device name (e.g. "tap0") */
  tapDevice: z.string(),
  /** Subnet index (0-based, used to compute IPs) */
  subnetIndex: z.number().int().nonnegative(),
  /** Host-side IP (where proxy listens) */
  hostIp: z.ipv4(),
  /** Guest-side IP (VM's address) */
  guestIp: z.ipv4(),
  /** CIDR notation for the /30 subnet */
  subnet: z.string(),
});

export type NetworkAllocation = z.infer<typeof NetworkAllocationSchema>;
