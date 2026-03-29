import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// --- Admin users ---

export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- Sessions (auth) ---

export const authSessions = sqliteTable('auth_sessions', {
  token: text('token').primaryKey(),
  email: text('email').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

// --- Daemons ---

export const daemons = sqliteTable('daemons', {
  role: text('role').primaryKey(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('active'),
  snapshot: text('snapshot').notNull(),
  trigger: text('trigger', { mode: 'json' }).notNull(),
  workload: text('workload', { mode: 'json' }),
  agent: text('agent', { mode: 'json' }),
  resources: text('resources', { mode: 'json' }),
  network: text('network', { mode: 'json' }),
  governance: text('governance', { mode: 'json' }).notNull(),
  createdAt: text('created_at').notNull(),
  totalInvocations: integer('total_invocations').notNull().default(0),
  lastInvokedAt: text('last_invoked_at'),
  totalDurationMs: integer('total_duration_ms').notNull().default(0),
  totalVcpuSeconds: real('total_vcpu_seconds').notNull().default(0),
});

// --- Sessions (VM sessions) ---

export const sessions = sqliteTable('sessions', {
  sessionId: text('session_id').primaryKey(),
  status: text('status').notNull().default('pending'),
  daemonRole: text('daemon_role'),
  request: text('request', { mode: 'json' }).notNull(),
  exitCode: integer('exit_code'),
  stdout: text('stdout'),
  stderr: text('stderr'),
  output: text('output', { mode: 'json' }),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  worker: text('worker'),
  metadata: text('metadata', { mode: 'json' }),
  resources: text('resources', { mode: 'json' }),
  vcpuSeconds: real('vcpu_seconds'),
  exposedPorts: text('exposed_ports', { mode: 'json' }),
});

// --- Snapshot configs ---

export const snapshotConfigs = sqliteTable('snapshot_configs', {
  id: text('id').primaryKey(),
  template: text('template'),
  resources: text('resources', { mode: 'json' }),
  setup: text('setup').notNull(),
  requiredDomains: text('required_domains', { mode: 'json' }).notNull().default('[]'),
});

// --- Servers (setup wizard) ---

export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ip: text('ip').notNull().default(''),
  status: text('status').notNull().default('pending'),
  provider: text('provider').notNull(),
  error: text('error'),
  sshPublicKey: text('ssh_public_key').notNull().default(''),
  sshPrivateKeyEncrypted: text('ssh_private_key_encrypted').notNull().default(''),
  providerServerId: text('provider_server_id'),
  createdAt: text('created_at').notNull(),
});

// --- Build jobs ---

export const buildJobs = sqliteTable('build_jobs', {
  jobId: text('job_id').primaryKey(),
  snapshotId: text('snapshot_id').notNull(),
  status: text('status').notNull().default('building'),
  worker: text('worker'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  error: text('error'),
});
