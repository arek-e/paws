/**
 * Version checker — polls GitHub Releases API for the latest paws version.
 *
 * The control plane is the single source of truth for "what version should
 * everything run." Workers and the dashboard query GET /v1/version instead
 * of checking GitHub directly.
 */

export interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string | null;
  changelog: string | null;
  checkedAt: string | null;
}

export interface VersionChecker {
  getInfo(): VersionInfo;
  checkNow(): Promise<VersionInfo>;
  stop(): void;
}

const GITHUB_REPO = 'arek-e/paws';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function createVersionChecker(currentVersion: string): VersionChecker {
  let latestVersion = currentVersion;
  let releaseUrl: string | null = null;
  let changelog: string | null = null;
  let checkedAt: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const disabled = process.env['DISABLE_UPDATE_CHECK'] === 'true';

  function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  async function check(): Promise<void> {
    if (disabled) return;

    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        tag_name: string;
        html_url: string;
        body?: string;
      };

      const version = data.tag_name.replace(/^v/, '');
      latestVersion = version;
      releaseUrl = data.html_url;
      changelog = data.body ?? null;
      checkedAt = new Date().toISOString();
    } catch {
      // Non-fatal — keep cached values
    }
  }

  function getInfo(): VersionInfo {
    return {
      current: currentVersion,
      latest: latestVersion,
      updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
      releaseUrl,
      changelog,
      checkedAt,
    };
  }

  async function checkNow(): Promise<VersionInfo> {
    await check();
    return getInfo();
  }

  // Start periodic checking
  if (!disabled) {
    check(); // initial check (non-blocking)
    timer = setInterval(check, CHECK_INTERVAL_MS);
  }

  return {
    getInfo,
    checkNow,
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
