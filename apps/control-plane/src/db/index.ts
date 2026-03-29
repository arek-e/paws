import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createLogger } from '@paws/logger';

import * as schema from './schema.js';

const log = createLogger('db');

export { schema };

/** Minimal interface for the underlying SQLite driver (works with both bun:sqlite and better-sqlite3) */
interface RawSqlite {
  exec(sql: string): void;
  prepare(sql: string): { all(): { name: string }[] };
}

/**
 * Create a SQLite database connection with Drizzle ORM.
 * Auto-detects Bun (bun:sqlite) vs Node.js (better-sqlite3).
 * Auto-creates the database file and tables on first run.
 */
export function createDatabase(dbPath: string) {
  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Detect runtime and create appropriate Drizzle instance
  let db: ReturnType<typeof import('drizzle-orm/bun-sqlite').drizzle>;
  let raw: RawSqlite;

  if (typeof globalThis.Bun !== 'undefined') {
    // Bun runtime — use bun:sqlite (built-in, fast)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite');
    const sqlite = new Database(dbPath);
    sqlite.exec('PRAGMA journal_mode = WAL');
    sqlite.exec('PRAGMA foreign_keys = ON');
    raw = sqlite;
    const { drizzle } = require('drizzle-orm/bun-sqlite');
    db = drizzle(sqlite, { schema });
  } else {
    // Node.js runtime (vitest, etc.) — use better-sqlite3
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite = require('better-sqlite3');
    const sqlite = new BetterSqlite(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    raw = sqlite;
    const { drizzle } = require('drizzle-orm/better-sqlite3');
    db = drizzle(sqlite, { schema });
  }

  // Auto-create tables if they don't exist
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = new Set(tables.map((t) => t.name));

  if (!tableNames.has('admin_users')) {
    raw.exec(`
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
        provider_server_id TEXT,
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
      CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_secret TEXT,
        redirect_uris TEXT NOT NULL,
        client_name TEXT,
        issued_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth_auth_codes (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        scopes TEXT,
        user_email TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        token TEXT PRIMARY KEY,
        token_type TEXT NOT NULL,
        client_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        scopes TEXT,
        expires_at INTEGER NOT NULL
      );
    `);
    log.info('Created database tables');
  }

  return db;
}

export type PawsDatabase = ReturnType<typeof createDatabase>;
