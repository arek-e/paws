/**
 * `paws logout` — clear stored credentials.
 */

import { clearCredentials } from '../auth.js';
import { printError, printSuccess } from '../output.js';

export async function logoutCommand(): Promise<number> {
  const removed = clearCredentials();

  if (removed) {
    printSuccess('Logged out — credentials removed from ~/.paws/credentials.json');
  } else {
    printError('No credentials found. Already logged out.');
  }

  return removed ? 0 : 1;
}
