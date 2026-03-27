/** Hetzner Robot API — server object */
export interface HetznerServer {
  server_number: number;
  server_name: string;
  server_ip: string;
  server_ipv6_net: string;
  /** Datacenter identifier, e.g. "FSN1-DC14" */
  dc: string;
  /** Product / plan name, e.g. "AX41-NVMe" */
  product: string;
  /** Current server lifecycle status */
  status: 'ready' | 'in process';
  cancelled: boolean;
  paid_until: string;
}

/** Wrapper returned by GET /server and GET /server/{id} */
export interface HetznerServerWrapper {
  server: HetznerServer;
}

/** Wrapper returned by GET /server (list) */
export type HetznerServerListResponse = HetznerServerWrapper[];

/** Hetzner Robot API — order transaction object */
export interface HetznerOrderTransaction {
  id: string;
  date: string;
  status: 'in progress' | 'ready' | 'error';
  server_number: number | null;
}

/** Wrapper returned by POST /order/server/transaction */
export interface HetznerOrderTransactionWrapper {
  transaction: HetznerOrderTransaction;
}

/** Body for POST /order/server/transaction */
export interface HetznerOrderServerRequest {
  product_id: string;
  /** Datacenter location, e.g. "FSN1" */
  location?: string;
  hostname?: string;
  /** SSH key fingerprints */
  authorized_key?: string[];
}

/** Hetzner Robot API error response */
export interface HetznerApiError {
  error: {
    status: number;
    code: string;
    message: string;
  };
}

/** Datacenter prefix → region string mapping */
export const DATACENTER_REGION_MAP: Record<string, string> = {
  FSN: 'fsn1',
  NBG: 'nbg1',
  HEL: 'hel1',
  EX: 'fsn1', // EX-series also in Falkenstein
};

/**
 * Map a Hetzner datacenter string (e.g. "FSN1-DC14", "NBG1-DC3") to a
 * normalised region identifier (e.g. "fsn1").
 */
export function datacenterToRegion(dc: string): string {
  // Datacenter strings look like "FSN1-DC14" or "NBG1-DC3"
  const prefix = dc.split(/[-\d]/)[0] ?? dc;
  return DATACENTER_REGION_MAP[prefix.toUpperCase()] ?? dc.toLowerCase();
}
