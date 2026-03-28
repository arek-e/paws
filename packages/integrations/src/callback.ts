import type { GitHubAuth } from './github-auth.js';

export interface CallbackDeps {
  auth: GitHubAuth;
}

/** Post a comment on a GitHub issue/PR */
export async function postComment(
  deps: CallbackDeps,
  installationId: number,
  issueUrl: string,
  body: string,
): Promise<void> {
  const token = await deps.auth.getInstallationToken(installationId);
  const commentsUrl = `${issueUrl}/comments`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(commentsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ body }),
    });

    if (res.ok) return;

    if (res.status === 403 || res.status === 429) {
      lastError = new Error(`GitHub API ${res.status}: ${await res.text()}`);
      await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
      continue;
    }

    throw new Error(`GitHub comment post failed: ${res.status} ${await res.text()}`);
  }

  throw lastError ?? new Error('Failed to post comment after retries');
}
