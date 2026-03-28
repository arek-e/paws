import type { SnapshotBuildStatus } from '@paws/types';

export interface StoredBuild {
  jobId: string;
  snapshotId: string;
  status: SnapshotBuildStatus;
  worker?: string | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  error?: string | undefined;
}

export interface BuildStore {
  create(jobId: string, snapshotId: string): StoredBuild;
  get(jobId: string): StoredBuild | undefined;
  updateStatus(jobId: string, status: SnapshotBuildStatus, result?: Partial<StoredBuild>): void;
}

/** In-memory build job store */
export function createBuildStore(): BuildStore {
  const builds = new Map<string, StoredBuild>();

  return {
    create(jobId, snapshotId) {
      const build: StoredBuild = {
        jobId,
        snapshotId,
        status: 'building',
        startedAt: new Date().toISOString(),
      };
      builds.set(jobId, build);
      return build;
    },

    get(jobId) {
      return builds.get(jobId);
    },

    updateStatus(jobId, status, result) {
      const build = builds.get(jobId);
      if (!build) return;
      build.status = status;
      if (result) {
        Object.assign(build, result);
      }
    },
  };
}
