/**
 * Resolve CLI configuration from flags, environment variables, or stored credentials.
 *
 * Priority:
 * 1. --api-key flag / PAWS_API_KEY env var
 * 2. ~/.paws/credentials.json (from `paws login`)
 */

import { loadAndRefreshCredentials } from './auth.js';

export interface CliConfig {
  url: string;
  apiKey: string;
}

export interface ResolveConfigOptions {
  flags: Record<string, string | undefined>;
  env: Record<string, string | undefined>;
}

export async function resolveConfig(options: ResolveConfigOptions): Promise<CliConfig> {
  const url = options.flags['url'] ?? options.env['PAWS_URL'];
  const apiKey = options.flags['api-key'] ?? options.env['PAWS_API_KEY'];

  // If explicit API key provided, use it
  if (url && apiKey) {
    return { url, apiKey };
  }

  // Try stored credentials from `paws login` (with automatic token refresh)
  const creds = await loadAndRefreshCredentials();
  if (creds) {
    return {
      url: url ?? creds.url,
      apiKey: apiKey ?? creds.accessToken,
    };
  }

  // No credentials at all
  if (!url) {
    throw new Error(
      'Missing gateway URL. Set --url, PAWS_URL, or run `paws login --url <server-url>`.',
    );
  }
  if (!apiKey) {
    throw new Error(
      'Missing API key. Set --api-key, PAWS_API_KEY, or run `paws login --url <server-url>`.',
    );
  }

  return { url, apiKey };
}

/**
 * Parse argv into a structured command invocation.
 *
 * Format: paws [global flags] <resource> <action> [positional] [flags]
 */
export interface ParsedArgs {
  resource: string | undefined;
  action: string | undefined;
  positional: string | undefined;
  flags: Record<string, string>;
  /** Flags that can appear multiple times (e.g. --env KEY=VAL --env KEY2=VAL2) */
  multiFlags?: Record<string, string[]>;
}

/** Flags that support multiple values (--env can be repeated) */
const MULTI_VALUE_FLAGS = new Set(['env']);

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const multiFlags: Record<string, string[]> = {};
  const positionals: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      // Boolean-style flags (no value) get "true", others consume next arg
      if (next === undefined || next.startsWith('--')) {
        flags[key] = 'true';
      } else {
        flags[key] = next;
        if (MULTI_VALUE_FLAGS.has(key)) {
          if (!multiFlags[key]) multiFlags[key] = [];
          multiFlags[key].push(next);
        }
        i++;
      }
    } else {
      positionals.push(arg);
    }
    i++;
  }

  return {
    resource: positionals[0],
    action: positionals[1],
    positional: positionals[2],
    flags,
    multiFlags,
  };
}
