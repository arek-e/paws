/**
 * Resolve CLI configuration from flags and environment variables.
 * Flags take precedence over env vars.
 */

export interface CliConfig {
  url: string;
  apiKey: string;
}

export interface ResolveConfigOptions {
  flags: Record<string, string | undefined>;
  env: Record<string, string | undefined>;
}

export function resolveConfig(options: ResolveConfigOptions): CliConfig {
  const url = options.flags['url'] ?? options.env['PAWS_URL'];
  const apiKey = options.flags['api-key'] ?? options.env['PAWS_API_KEY'];

  if (!url) {
    throw new Error('Missing gateway URL. Set --url or PAWS_URL environment variable.');
  }
  if (!apiKey) {
    throw new Error('Missing API key. Set --api-key or PAWS_API_KEY environment variable.');
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
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
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
  };
}
