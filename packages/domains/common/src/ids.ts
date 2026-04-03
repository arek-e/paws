import { z } from 'zod';

export const SessionId = z.string().uuid().brand<'SessionId'>();
export type SessionId = z.infer<typeof SessionId>;

export const DaemonId = z.string().uuid().brand<'DaemonId'>();
export type DaemonId = z.infer<typeof DaemonId>;

export const WorkerId = z.string().uuid().brand<'WorkerId'>();
export type WorkerId = z.infer<typeof WorkerId>;

export const SnapshotId = z.string().min(1).brand<'SnapshotId'>();
export type SnapshotId = z.infer<typeof SnapshotId>;
