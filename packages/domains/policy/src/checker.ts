import type { Governance } from './types.js';

interface RateWindow {
  count: number;
  resetAt: number;
}

export interface GovernanceChecker {
  /** Check if an action is allowed under the governance policy */
  checkRateLimit(role: string, governance: Governance): boolean;
  /** Record an action for rate limiting */
  recordAction(role: string): void;
}

/** In-memory rate limiter for governance enforcement */
export function createGovernanceChecker(): GovernanceChecker {
  const windows = new Map<string, RateWindow>();
  const HOUR_MS = 60 * 60 * 1000;

  function getWindow(role: string): RateWindow {
    const now = Date.now();
    const existing = windows.get(role);
    if (existing && existing.resetAt > now) {
      return existing;
    }
    const window: RateWindow = { count: 0, resetAt: now + HOUR_MS };
    windows.set(role, window);
    return window;
  }

  return {
    checkRateLimit(role, governance) {
      if (governance.maxActionsPerHour === undefined) return true;
      const window = getWindow(role);
      return window.count < governance.maxActionsPerHour;
    },

    recordAction(role) {
      const window = getWindow(role);
      window.count++;
    },
  };
}
