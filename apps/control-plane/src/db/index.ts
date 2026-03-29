import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import * as schema from './schema.js';

export { schema };

/**
 * Create a SQLite database connection with Drizzle ORM.
 * Auto-creates the database file and runs migrations (push schema).
 */
export function createDatabase(dbPath: string) {
  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Auto-create tables if they don't exist
  // In production, use drizzle-kit migrations. For now, push schema directly.
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string;
  }[];
  const tableNames = new Set(tables.map((t) => t.name));

  if (!tableNames.has('admin_users')) {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daemons (
        role TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        snapshot TEXT NOT NULL,
        trigger TEXT NOT NULL,
        workload TEXT,
        agent TEXT,
        resources TEXT,
        network TEXT,
        governance TEXT NOT NULL,
        created_at TEXT NOT NULL,
        total_invocations INTEGER NOT NULL DEFAULT 0,
        last_invoked_at TEXT,
        total_duration_ms INTEGER NOT NULL DEFAULT 0,
        total_vcpu_seconds REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        daemon_role TEXT,
        request TEXT NOT NULL,
        exit_code INTEGER,
        stdout TEXT,
        stderr TEXT,
        output TEXT,
        started_at TEXT,
        completed_at TEXT,
        duration_ms INTEGER,
        worker TEXT,
        metadata TEXT,
        resources TEXT,
        vcpu_seconds REAL,
        exposed_ports TEXT
      );
      CREATE TABLE IF NOT EXISTS snapshot_configs (
        id TEXT PRIMARY KEY,
        template TEXT,
        resources TEXT,
        setup TEXT NOT NULL,
        required_domains TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        provider TEXT NOT NULL,
        error TEXT,
        ssh_public_key TEXT NOT NULL DEFAULT '',
        ssh_private_key_encrypted TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS build_jobs (
        job_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'building',
        worker TEXT,
        started_at TEXT,
        completed_at TEXT,
        error TEXT
      );
    `);
    console.log('[db] Created database tables');
  }

  return db;
}

export type PawsDatabase = ReturnType<typeof createDatabase>;
