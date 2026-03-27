/**
 * Counting semaphore with FIFO queue for VM concurrency control.
 *
 * Limits the number of concurrent sessions. When capacity is reached,
 * new requests are queued and resolved in order as slots free up.
 */
export function createSemaphore(maxConcurrent: number, maxQueued: number = Infinity) {
  let running = 0;
  const queue: Array<{
    resolve: () => void;
    reject: (reason: Error) => void;
  }> = [];

  return {
    /**
     * Acquire a slot. Resolves immediately if capacity is available,
     * otherwise waits in the FIFO queue.
     * Throws if the queue is full.
     */
    async acquire(): Promise<void> {
      if (running < maxConcurrent) {
        running++;
        return;
      }

      if (queue.length >= maxQueued) {
        throw new Error(`Queue full (${maxQueued} pending)`);
      }

      return new Promise<void>((resolve, reject) => {
        queue.push({ resolve, reject });
      });
    },

    /** Release a slot, allowing the next queued request to proceed */
    release(): void {
      const next = queue.shift();
      if (next) {
        next.resolve();
      } else {
        running = Math.max(0, running - 1);
      }
    },

    /** Reject all queued requests (for graceful shutdown) */
    drain(reason: Error): void {
      for (const entry of queue.splice(0)) {
        entry.reject(reason);
      }
    },

    /** Number of currently running sessions */
    get running(): number {
      return running;
    },

    /** Number of queued requests */
    get queued(): number {
      return queue.length;
    },

    /** Number of available slots (0 if queue is non-empty) */
    get available(): number {
      return Math.max(0, maxConcurrent - running);
    },
  };
}

export type Semaphore = ReturnType<typeof createSemaphore>;
