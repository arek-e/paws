import type { GitHubEvent, GitHubDaemon } from './types.js';

export interface MatchResult {
  daemon: GitHubDaemon;
  event: GitHubEvent;
}

/** Map internal event type to GitHub webhook event names used in daemon config */
const EVENT_TYPE_MAP: Record<string, string[]> = {
  mention: ['issue_comment', 'mention'],
  pull_request: ['pull_request'],
};

/** Find the daemon that matches a GitHub event */
export function matchDaemon(event: GitHubEvent, daemons: GitHubDaemon[]): MatchResult | null {
  const candidates = daemons.filter((d) => {
    // Repo must match
    const repoMatch = d.trigger.repos.includes('*') || d.trigger.repos.includes(event.repo);
    if (!repoMatch) return false;

    // Event type must be in daemon's events list
    const matchNames = EVENT_TYPE_MAP[event.type] ?? [event.type];
    if (!d.trigger.events.some((e) => matchNames.includes(e))) return false;

    // For mention events, also match on command
    if (event.type === 'mention') {
      const expectedCommand = d.trigger.command ?? d.role;
      return event.command.toLowerCase().startsWith(expectedCommand.toLowerCase());
    }

    // For pull_request events, repo + event type match is sufficient
    return true;
  });

  if (candidates.length === 0) return null;

  // Prefer most specific: explicit repo > wildcard
  const specific = candidates.find((d) => d.trigger.repos.includes(event.repo));
  const chosen = specific ?? candidates[0]!;

  return { daemon: chosen, event };
}
