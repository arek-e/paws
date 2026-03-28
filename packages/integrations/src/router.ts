import type { GitHubEvent, GitHubDaemon } from './types.js';

export interface MatchResult {
  daemon: GitHubDaemon;
  event: GitHubEvent;
}

/** Find the daemon that matches a GitHub event */
export function matchDaemon(event: GitHubEvent, daemons: GitHubDaemon[]): MatchResult | null {
  const candidates = daemons.filter((d) => {
    const repoMatch = d.trigger.repos.includes('*') || d.trigger.repos.includes(event.repo);
    if (!repoMatch) return false;

    const expectedCommand = d.trigger.command ?? d.role;
    return event.command.toLowerCase().startsWith(expectedCommand.toLowerCase());
  });

  if (candidates.length === 0) return null;

  // Prefer most specific: explicit repo > wildcard
  const specific = candidates.find((d) => d.trigger.repos.includes(event.repo));
  const chosen = specific ?? candidates[0]!;

  return { daemon: chosen, event };
}
