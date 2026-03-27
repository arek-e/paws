#!/usr/bin/env bun
/**
 * Standalone proxy entrypoint — reads a YAML config file and starts the proxy.
 *
 * Usage: bun run src/standalone.ts <config.yaml>
 *
 * Config format:
 *   listen: "0.0.0.0:8443"
 *   domains:
 *     api.anthropic.com:
 *       headers:
 *         x-api-key: "sk-ant-..."
 *     api.openai.com:
 *       headers:
 *         Authorization: "Bearer sk-..."
 */
import { createProxy } from './server.js';
import { generateSessionCa } from './ca.js';
import type { DomainEntry, ProxyConfig } from './types.js';

const configPathArg = process.argv[2];
if (!configPathArg) {
  console.error('Usage: bun run standalone.ts <config.yaml>');
  process.exit(1);
}
const configPath: string = configPathArg;

/** Minimal YAML parser for the proxy config format (no external deps) */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let currentDomain: string | undefined;
  let currentSection: string | undefined;
  let headers: Record<string, string> | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    // Top-level key: "listen: ..."
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      // Flush any pending domain
      if (currentDomain && headers) {
        const domains = (result['domains'] as Record<string, DomainEntry>) ?? {};
        domains[currentDomain] = { headers };
        result['domains'] = domains;
        headers = undefined;
        currentDomain = undefined;
      }

      const match = line.match(/^(\w+):\s*(.*)/);
      if (match) {
        const [, key, value] = match;
        if (key && value && !value.trim().startsWith('')) {
          const trimmed = value.trim().replace(/^["']|["']$/g, '');
          if (trimmed) {
            result[key] = trimmed;
          } else {
            currentSection = key;
          }
        } else if (key) {
          currentSection = key;
        }
      }
      continue;
    }

    // 2-space indent: domain name under "domains:"
    const indent = line.search(/\S/);
    if (indent === 2 && currentSection === 'domains') {
      // Flush previous domain
      if (currentDomain && headers) {
        const domains = (result['domains'] as Record<string, DomainEntry>) ?? {};
        domains[currentDomain] = { headers };
        result['domains'] = domains;
      }
      headers = undefined;

      const domainMatch = line.trim().match(/^([^:]+):/);
      if (domainMatch?.[1]) {
        currentDomain = domainMatch[1].trim();
      }
      continue;
    }

    // 4-space indent: "headers:" under a domain
    if (indent === 4 && line.trim() === 'headers:') {
      headers = {};
      continue;
    }

    // 6-space indent: header key-value under "headers:"
    if (indent === 6 && headers !== undefined) {
      const headerMatch = line.trim().match(/^([^:]+):\s*["']?([^"']*)["']?/);
      if (headerMatch?.[1] && headerMatch[2] !== undefined) {
        headers[headerMatch[1].trim()] = headerMatch[2].trim();
      }
    }
  }

  // Flush last domain
  if (currentDomain && headers) {
    const domains = (result['domains'] as Record<string, DomainEntry>) ?? {};
    domains[currentDomain] = { headers };
    result['domains'] = domains;
  }

  return result;
}

async function main() {
  const configText = await Bun.file(configPath).text();
  const raw = parseSimpleYaml(configText);

  // Parse listen address
  const listenStr = (raw['listen'] as string) ?? '0.0.0.0:8443';
  const [host, portStr] = listenStr.split(':');
  const port = parseInt(portStr ?? '8443', 10);

  // Parse domains
  const domains = (raw['domains'] as Record<string, DomainEntry>) ?? {};

  // Generate ephemeral CA
  const tmpDir = `/tmp/paws-proxy-ca-${Date.now()}`;
  const caResult = await generateSessionCa({ dir: tmpDir });
  if (caResult.isErr()) {
    console.error(`Failed to generate CA: ${caResult.error.message}`);
    process.exit(1);
  }
  const ca = caResult.value;

  const config: ProxyConfig = {
    listen: { host: host ?? '0.0.0.0', port },
    domains,
    ca: { cert: ca.cert, key: ca.key },
  };

  const proxy = createProxy(config);
  await proxy.start();

  const addr = proxy.address();
  console.log(
    `paws proxy listening on ${addr.host}:${addr.port} (HTTP) / ${addr.port + 1} (HTTPS)`,
  );
  console.log(`Allowlisted domains: ${Object.keys(domains).join(', ') || '(none)'}`);
  console.log(`CA cert: ${ca.certPath}`);
  console.log('');
  console.log('Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await proxy.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await proxy.stop();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
