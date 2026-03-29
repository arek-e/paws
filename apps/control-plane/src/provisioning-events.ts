import type { ProvisionerEvent } from '@paws/provisioner';

export interface ProvisioningEventBus {
  /** Subscribe to events for a specific server. Returns an unsubscribe function. */
  subscribe(serverId: string, listener: (event: ProvisionerEvent) => void): () => void;
  /** Publish an event to all subscribers for the given server ID. */
  publish(event: ProvisionerEvent): void;
}

export function createProvisioningEventBus(): ProvisioningEventBus {
  const listeners = new Map<string, Set<(event: ProvisionerEvent) => void>>();

  return {
    subscribe(serverId, listener) {
      if (!listeners.has(serverId)) listeners.set(serverId, new Set());
      listeners.get(serverId)!.add(listener);
      return () => {
        listeners.get(serverId)?.delete(listener);
        // Clean up empty sets
        if (listeners.get(serverId)?.size === 0) listeners.delete(serverId);
      };
    },

    publish(event) {
      for (const listener of listeners.get(event.serverId) ?? []) {
        listener(event);
      }
    },
  };
}
