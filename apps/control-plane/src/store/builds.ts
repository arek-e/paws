import { eq } from 'drizzle-orm';

import type { SnapshotBuildStatus } from '@paws/domain-snapshot';

import type { PawsDatabase } from '../db/index.js';
import { buildJobs as buildJobsTable } from '../db/schema.js';

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

type BuildRow = typeof buildJobsTable.$inferSelect;

function rowToStoredBuild(row: BuildRow): StoredBuild {
  return {
    jobId: row.jobId,
    snapshotId: row.snapshotId,
    status: row.status as SnapshotBuildStatus,
    worker: row.worker ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    error: row.error ?? undefined,
  };
}

/** SQLite-backed build store */
export function createSqliteBuildStore(db: PawsDatabase): BuildStore {
  return {
    create(jobId, snapshotId) {
      const now = new Date().toISOString();
      db.insert(buildJobsTable)
        .values({
          jobId,
          snapshotId,
          status: 'building',
          startedAt: now,
        })
        .run();
      return this.get(jobId)!;
    },

    get(jobId) {
      const row = db.select().from(buildJobsTable).where(eq(buildJobsTable.jobId, jobId)).get();
      return row ? rowToStoredBuild(row) : undefined;
    },

    updateStatus(jobId, status, result) {
      const values: Record<string, unknown> = { status };
      if (result) {
        if (result.worker !== undefined) values['worker'] = result.worker;
        if (result.completedAt !== undefined) values['completedAt'] = result.completedAt;
        if (result.error !== undefined) values['error'] = result.error;
      }
      db.update(buildJobsTable).set(values).where(eq(buildJobsTable.jobId, jobId)).run();
    },
  };
}
