import type { DomainEntry } from './types.js';

/**
 * Match a hostname against an allowlist of domain patterns.
 * Supports exact matches and wildcard prefixes (e.g. "*.github.com").
 *
 * Wildcard rules:
 * - "*.github.com" matches "foo.github.com", "bar.github.com"
 * - "*.github.com" does NOT match "github.com" itself
 * - "github.com" matches only "github.com" exactly
 */
export function matchesDomain(hostname: string, patterns: readonly string[]): boolean {
  const lower = hostname.toLowerCase();
  for (const pattern of patterns) {
    const p = pattern.toLowerCase();
    if (p.startsWith('*.')) {
      const suffix = p.slice(1); // ".github.com"
      if (lower.endsWith(suffix) && lower.length > suffix.length) {
        return true;
      }
    } else if (lower === p) {
      return true;
    }
  }
  return false;
}

/**
 * Find the credential headers for a hostname from the domains map.
 * Supports exact match and wildcard matching.
 * Returns the headers to inject, or undefined if no credentials match.
 */
export function findCredentials(
  hostname: string,
  domains: Record<string, DomainEntry>,
): Record<string, string> | undefined {
  const lower = hostname.toLowerCase();

  // Exact match first
  for (const [domain, entry] of Object.entries(domains)) {
    if (domain.toLowerCase() === lower && entry.headers) {
      return entry.headers;
    }
  }

  // Wildcard match
  for (const [domain, entry] of Object.entries(domains)) {
    const d = domain.toLowerCase();
    if (d.startsWith('*.')) {
      const suffix = d.slice(1);
      if (lower.endsWith(suffix) && lower.length > suffix.length && entry.headers) {
        return entry.headers;
      }
    }
  }

  return undefined;
}

/**
 * Find the domain entry for a hostname (including target override).
 * Used to resolve upstream target for testing/proxying.
 */
export function findDomainEntry(
  hostname: string,
  domains: Record<string, DomainEntry>,
): DomainEntry | undefined {
  const lower = hostname.toLowerCase();

  // Exact match first
  for (const [domain, entry] of Object.entries(domains)) {
    if (domain.toLowerCase() === lower) {
      return entry;
    }
  }

  // Wildcard match
  for (const [domain, entry] of Object.entries(domains)) {
    const d = domain.toLowerCase();
    if (d.startsWith('*.')) {
      const suffix = d.slice(1);
      if (lower.endsWith(suffix) && lower.length > suffix.length) {
        return entry;
      }
    }
  }

  return undefined;
}
