import { SignJWT, importPKCS8 } from 'jose';

interface CachedToken {
  token: string;
  expiresAt: Date;
  installationId: number;
}

export interface GitHubInstallation {
  id: number;
  account: { login: string } | null;
  appSlug?: string;
}

export interface GitHubRepo {
  fullName: string;
  private: boolean;
  htmlUrl: string;
}

export interface GitHubAuth {
  getInstallationToken(installationId: number): Promise<string>;
  listInstallations(): Promise<GitHubInstallation[]>;
  listInstallationRepos(installationId: number): Promise<GitHubRepo[]>;
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

    async listInstallations(): Promise<GitHubInstallation[]> {
      const jwt = await createAppJwt();
      const res = await fetch('https://api.github.com/app/installations', {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) {
        throw new Error(`GitHub list installations failed: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as Array<{
        id: number;
        account: { login: string } | null;
        app_slug?: string;
      }>;

      return data.map((i) => ({
        id: i.id,
        account: i.account,
        ...(i.app_slug ? { appSlug: i.app_slug } : {}),
      }));
    },

    async listInstallationRepos(installationId): Promise<GitHubRepo[]> {
      const token = await this.getInstallationToken(installationId);
      const res = await fetch('https://api.github.com/installation/repositories?per_page=100', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) {
        throw new Error(`GitHub list repos failed: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as {
        repositories: Array<{
          full_name: string;
          private: boolean;
          html_url: string;
        }>;
      };

      return data.repositories.map((r) => ({
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
      }));
    },
  };
}
