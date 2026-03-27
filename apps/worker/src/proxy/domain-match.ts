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
 * Find the credential config for a hostname from the credentials map.
 * Supports exact match and wildcard matching.
 * Returns the headers to inject, or undefined if no credentials match.
 */
export function findCredentials(
  hostname: string,
  credentials: Record<string, { headers: Record<string, string> }>,
): Record<string, string> | undefined {
  const lower = hostname.toLowerCase();

  // Exact match first
  for (const [domain, cred] of Object.entries(credentials)) {
    if (domain.toLowerCase() === lower) {
      return cred.headers;
    }
  }

  // Wildcard match
  for (const [domain, cred] of Object.entries(credentials)) {
    const d = domain.toLowerCase();
    if (d.startsWith('*.')) {
      const suffix = d.slice(1);
      if (lower.endsWith(suffix) && lower.length > suffix.length) {
        return cred.headers;
      }
    }
  }

  return undefined;
}
