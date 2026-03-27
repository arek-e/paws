/**
 * Hetzner Cloud API response types.
 * Reference: https://docs.hetzner.cloud/
 */

/** Hetzner Cloud server status values */
export type HetznerServerStatus =
  | 'running'
  | 'off'
  | 'initializing'
  | 'starting'
  | 'stopping'
  | 'rebuilding'
  | 'migrating'
  | 'deleting'
  | 'unknown';

export interface HetznerServer {
  id: number;
  name: string;
  status: HetznerServerStatus;
  created: string;
  public_net: {
    ipv4: {
      ip: string;
    } | null;
    ipv6: {
      ip: string;
    } | null;
  };
  datacenter: {
    name: string;
  };
  server_type: {
    name: string;
  };
}

export interface HetznerServerListResponse {
  servers: HetznerServer[];
}

export interface HetznerServerResponse {
  server: HetznerServer;
}

export interface HetznerCreateServerRequest {
  name: string;
  server_type: string;
  image: string;
  location?: string;
  ssh_keys?: string[];
  user_data?: string;
}

export interface HetznerCreateServerResponse {
  server: HetznerServer;
}

export interface HetznerErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
