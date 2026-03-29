/**
 * Reset the admin password.
 *
 * Usage:
 *   bun run apps/control-plane/src/scripts/reset-password.ts
 *   docker exec -it <container> bun run reset-password
 *
 * Generates a random password, updates the admin account in SQLite,
 * and prints the new password to stdout.
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createDatabase } from '../db/index.js';
import { adminUsers, authSessions } from '../db/schema.js';

const DATA_DIR = process.env['DATA_DIR'] ?? '/var/lib/paws/data';
const db = createDatabase(`${DATA_DIR}/paws.db`);

// Find the admin account
const admin = db.select().from(adminUsers).limit(1).get();

if (!admin) {
  console.error(
    '\n /\\_/\\\n( x.x )  no admin account found — run the setup wizard first\n > ^ <\n',
  );
  process.exit(1);
}

// Generate a random password (16 chars, URL-safe)
const newPassword = randomUUID().replace(/-/g, '').slice(0, 16);

// Hash it (same as password.ts)
const encoder = new TextEncoder();
const data = encoder.encode(newPassword);
const hash = await crypto.subtle.digest('SHA-256', data);
const passwordHash = Array.from(new Uint8Array(hash))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

// Update the admin's password
db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, admin.id)).run();

// Invalidate all existing sessions for this admin
db.delete(authSessions).where(eq(authSessions.email, admin.email)).run();

console.log(`
 /\\_/\\
( o.o )  password reset
 > ^ <

Account:  ${admin.email}
Password: ${newPassword}

All existing sessions have been invalidated.
Log in with the new password at the dashboard.
`);
