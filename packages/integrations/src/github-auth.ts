import { SignJWT, importPKCS8 } from 'jose';

interface CachedToken {
  token: string;
  expiresAt: Date;
  installationId: number;
}

export interface GitHubAuth {
  getInstallationToken(installationId: number): Promise<string>;
}

export function createGitHubAuth(appId: string, privateKeyPem: string): GitHubAuth {
  const tokenCache = new Map<number, CachedToken>();

  async function createAppJwt(): Promise<string> {
    const key = await importPKCS8(privateKeyPem, 'RS256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(appId)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(key);
  }

  return {
    async getInstallationToken(installationId) {
      const cached = tokenCache.get(installationId);
      if (cached && cached.expiresAt > new Date(Date.now() + 5 * 60_000)) {
        return cached.token;
      }

      const jwt = await createAppJwt();
      const res = await fetch(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      if (!res.ok) {
        throw new Error(`GitHub token exchange failed: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as { token: string; expires_at: string };
      tokenCache.set(installationId, {
        token: data.token,
        expiresAt: new Date(data.expires_at),
        installationId,
      });

      return data.token;
    },
  };
}
