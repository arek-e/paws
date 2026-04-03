import type { PortExposureProvider, ExposedPortResult } from '@paws/runtime';

import type { PangolinResourceManager } from './pangolin-resources.js';

/**
 * Adapt PangolinResourceManager to the runtime's PortExposureProvider interface.
 *
 * This bridges the worker's Pangolin tunnel integration with the runtime adapter's
 * generic port exposure contract.
 */
export function createPangolinPortExposure(
  pangolinResources: PangolinResourceManager,
): PortExposureProvider {
  // Track tunnels per session for cleanup
  const sessionTunnels = new Map<string, Awaited<ReturnType<typeof pangolinResources.expose>>>();

  return {
    async expose(sessionId, ports, hostPorts): Promise<ExposedPortResult[]> {
      const tunnels = await pangolinResources.expose(sessionId, ports, hostPorts);
      sessionTunnels.set(sessionId, tunnels);
      return tunnels.map((t) => ({
        port: t.port,
        url: t.publicUrl,
        label: t.label,
        access: t.access,
        pin: t.pin,
        shareLink: t.shareLink,
      }));
    },

    async cleanup(sessionId, _tunnels) {
      const tunnels = sessionTunnels.get(sessionId);
      if (tunnels?.length) {
        await pangolinResources.cleanup(tunnels);
        sessionTunnels.delete(sessionId);
      }
    },
  };
}
