import { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import type { PawsClient } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { formatOutput, printError, printSuccess, printInfo } from '../output.js';
import { ProgressChecklist } from '../ui/ProgressChecklist.js';
import type { Step } from '../ui/ProgressChecklist.js';

const SERVERS_HELP = `
Usage: paws servers <action> [options]

Actions:
  list                    List all registered servers
  add                     Add a server via SSH
  add-ec2                 Launch and bootstrap an AWS EC2 instance
  test <ip>               Test SSH connectivity to a server
  remove <id>             Remove a server

Add options (SSH):
  --name <name>           Server name (default: worker-01)
  --ip <ip>               Server IP address (required)
  --user <user>           SSH username (default: root)
  --port <port>           SSH port (default: 22)
  --password <pass>       SSH password
  --key <path>            Path to SSH private key file
  --passphrase <pass>     Key passphrase (if encrypted)

Add options (EC2):
  --name <name>           Server name (default: aws-worker)
  --access-key <key>      AWS Access Key ID (required)
  --secret-key <key>      AWS Secret Access Key (required)
  --region <region>       AWS region (default: us-east-1)

Examples:
  paws servers list --pretty
  paws servers add --ip 65.108.10.170 --password mypass
  paws servers add --ip 10.0.0.1 --key ~/.ssh/id_ed25519 --user ubuntu
  paws servers add-ec2 --access-key AKIA... --secret-key ... --region eu-central-1
  paws servers test 65.108.10.170
  paws servers remove abc-123
`;

interface ServerApiConfig {
  baseUrl: string;
  apiKey: string;
}

async function apiFetch(
  config: ServerApiConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function serversCommand(
  _client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const config = {
    baseUrl: args.flags['url'] ?? process.env['PAWS_URL'] ?? 'http://localhost:4000',
    apiKey: args.flags['api-key'] ?? process.env['PAWS_API_KEY'] ?? '',
  };

  switch (args.action) {
    case 'list':
      return serversList(config, pretty);
    case 'add':
      return serversAdd(config, args, pretty);
    case 'add-ec2':
      return serversAddEc2(config, args, pretty);
    case 'test':
      return serversTest(config, args, pretty);
    case 'remove':
      return serversRemove(config, args, pretty);
    case 'help':
    case undefined:
      process.stdout.write(SERVERS_HELP + '\n');
      return 0;
    default:
      printError(
        `Unknown servers action: ${args.action}. Available: list, add, add-ec2, test, remove`,
      );
      return 1;
  }
}

async function serversList(config: ServerApiConfig, pretty: boolean): Promise<number> {
  const { ok, data } = await apiFetch(config, 'GET', '/v1/servers');
  if (!ok) {
    printError(`Failed to list servers: ${JSON.stringify(data)}`);
    return 1;
  }
  process.stdout.write(formatOutput(data, pretty) + '\n');
  return 0;
}

// ---------------------------------------------------------------------------
// Ink component for interactive server add
// ---------------------------------------------------------------------------

interface ServerAddViewProps {
  config: ServerApiConfig;
  body: Record<string, unknown>;
  ip: string;
  onDone: (code: number) => void;
}

function ServerAddView({ config, body, ip, onDone }: ServerAddViewProps) {
  const [steps, setSteps] = useState<Step[]>([
    { label: `Connecting to ${ip}...`, status: 'active' },
    { label: 'Provisioning server', status: 'pending' },
  ]);
  const [serverId, setServerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { ok, data } = await apiFetch(config, 'POST', '/v1/setup/servers', body);

      if (cancelled) return;

      if (!ok) {
        setSteps((prev) => [{ ...prev[0]!, status: 'error' }, prev[1]!]);
        setError(`Failed to add server: ${JSON.stringify(data)}`);
        onDone(1);
        return;
      }

      const id = (data as { serverId: string }).serverId;
      setServerId(id);
      setSteps([
        { label: `Connected to ${ip}`, status: 'done' },
        { label: `Provisioning started (ID: ${id})`, status: 'done' },
      ]);
      onDone(0);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [config, body, ip]);

  return (
    <Box flexDirection="column">
      <ProgressChecklist steps={steps} />
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      {serverId && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">{'\u2713'} Server provisioning started</Text>
          <Text dimColor>
            Monitor progress in the dashboard or poll: paws servers list --pretty
          </Text>
        </Box>
      )}
    </Box>
  );
}

async function serversAdd(
  config: ServerApiConfig,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const ip = args.flags['ip'];
  if (!ip) {
    printError('--ip is required. Usage: paws servers add --ip <ip> --password <pass>');
    return 1;
  }

  const password = args.flags['password'];
  const keyPath = args.flags['key'];
  let privateKey: string | undefined;

  if (keyPath) {
    try {
      const { readFileSync } = await import('node:fs');
      privateKey = readFileSync(keyPath, 'utf8');
    } catch (_err) {
      printError(`Failed to read key file: ${keyPath}`);
      return 1;
    }
  }

  if (!password && !privateKey) {
    printError('Either --password or --key is required');
    return 1;
  }

  const body = {
    provider: 'manual',
    name: args.flags['name'] ?? 'worker-01',
    ip,
    authMethod: privateKey ? 'privateKey' : 'password',
    username: args.flags['user'] ?? 'root',
    port: parseInt(args.flags['port'] ?? '22', 10),
    ...(password ? { password } : {}),
    ...(privateKey ? { privateKey } : {}),
    ...(args.flags['passphrase'] ? { passphrase: args.flags['passphrase'] } : {}),
  };

  const isTTY = process.stdout.isTTY === true;

  if (!isTTY) {
    // Non-interactive fallback
    printInfo(`Connecting to ${ip}...`);
    const { ok, data } = await apiFetch(config, 'POST', '/v1/setup/servers', body);
    if (!ok) {
      printError(`Failed to add server: ${JSON.stringify(data)}`);
      return 1;
    }
    const serverId = (data as { serverId: string }).serverId;
    printSuccess(`Server provisioning started (ID: ${serverId})`);
    process.stdout.write(formatOutput(data, pretty) + '\n');
    return 0;
  }

  return new Promise<number>((resolve) => {
    const { unmount } = render(
      <ServerAddView
        config={config}
        body={body}
        ip={ip}
        onDone={(code) => {
          setTimeout(() => {
            unmount();
            resolve(code);
          }, 100);
        }}
      />,
    );
  });
}

async function serversAddEc2(
  config: ServerApiConfig,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const accessKey = args.flags['access-key'];
  const secretKey = args.flags['secret-key'];

  if (!accessKey || !secretKey) {
    printError('--access-key and --secret-key are required');
    return 1;
  }

  const body = {
    provider: 'aws-ec2',
    name: args.flags['name'] ?? 'aws-worker',
    awsAccessKey: accessKey,
    awsSecretKey: secretKey,
    region: args.flags['region'] ?? 'us-east-1',
  };

  printInfo(`Launching EC2 instance in ${body.region}...`);
  const { ok, data } = await apiFetch(config, 'POST', '/v1/setup/servers', body);
  if (!ok) {
    printError(`Failed to launch: ${JSON.stringify(data)}`);
    return 1;
  }

  const serverId = (data as { serverId: string }).serverId;
  printSuccess(`EC2 provisioning started (ID: ${serverId})`);
  printInfo('Monitor progress: paws servers list --pretty');
  process.stdout.write(formatOutput(data, pretty) + '\n');
  return 0;
}

// ---------------------------------------------------------------------------
// Ink component for connection test
// ---------------------------------------------------------------------------

interface ServerTestViewProps {
  config: ServerApiConfig;
  body: Record<string, unknown>;
  ip: string;
  port: number;
  onDone: (code: number) => void;
}

function ServerTestView({ config, body, ip, port, onDone }: ServerTestViewProps) {
  const [testing, setTesting] = useState(true);
  const [checks, setChecks] = useState<
    { name: string; status: string; message: string; ms?: number }[]
  >([]);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { ok, data } = await apiFetch(
        config,
        'POST',
        '/v1/setup/servers/test-connection',
        body,
      );

      if (cancelled) return;
      setTesting(false);

      if (!ok) {
        setError(`Test failed: ${JSON.stringify(data)}`);
        onDone(1);
        return;
      }

      const result = data as {
        success: boolean;
        checks: { name: string; status: string; message: string; ms?: number }[];
      };

      setChecks(result.checks);
      setSuccess(result.success);
      onDone(result.success ? 0 : 1);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [config, body, ip]);

  return (
    <Box flexDirection="column">
      {testing && <InkSpinner label={`Testing connection to ${ip}:${port}...`} />}

      {checks.map((check, i) => {
        const icon = check.status === 'pass' ? '\u2713' : '\u2717';
        const color = check.status === 'pass' ? 'green' : 'red';
        const time = check.ms !== undefined ? ` (${check.ms}ms)` : '';
        return (
          <Box key={i} gap={1}>
            <Text color={color}>{icon}</Text>
            <Text>
              {check.message}
              {time}
            </Text>
          </Box>
        );
      })}

      {success === true && <Text color="green">{'\u2713'} Connection test passed</Text>}
      {success === false && <Text color="red">{'\u2717'} Connection test failed</Text>}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

async function serversTest(
  config: ServerApiConfig,
  args: ParsedArgs,
  _pretty: boolean,
): Promise<number> {
  const ip = args.positional ?? args.flags['ip'];
  if (!ip) {
    printError('IP address required. Usage: paws servers test <ip>');
    return 1;
  }

  const port = parseInt(args.flags['port'] ?? '22', 10);

  const body = {
    ip,
    port,
    username: args.flags['user'] ?? 'root',
    authMethod: 'password' as const,
    password: args.flags['password'] ?? 'test',
  };

  const isTTY = process.stdout.isTTY === true;

  if (!isTTY) {
    // Non-interactive fallback
    printInfo(`Testing connection to ${ip}:${port}...`);
    const { ok, data } = await apiFetch(config, 'POST', '/v1/setup/servers/test-connection', body);
    if (!ok) {
      printError(`Test failed: ${JSON.stringify(data)}`);
      return 1;
    }

    const result = data as {
      success: boolean;
      checks: { name: string; status: string; message: string; ms?: number }[];
    };

    for (const check of result.checks) {
      const icon = check.status === 'pass' ? '\u2713' : '\u2717';
      const time = check.ms !== undefined ? ` (${check.ms}ms)` : '';
      process.stdout.write(`  ${icon} ${check.message}${time}\n`);
    }

    if (result.success) {
      printSuccess('Connection test passed');
    } else {
      printError('Connection test failed');
    }

    return result.success ? 0 : 1;
  }

  return new Promise<number>((resolve) => {
    const { unmount } = render(
      <ServerTestView
        config={config}
        body={body}
        ip={ip}
        port={port}
        onDone={(code) => {
          setTimeout(() => {
            unmount();
            resolve(code);
          }, 100);
        }}
      />,
    );
  });
}

async function serversRemove(
  config: ServerApiConfig,
  args: ParsedArgs,
  _pretty: boolean,
): Promise<number> {
  const id = args.positional;
  if (!id) {
    printError('Server ID required. Usage: paws servers remove <id>');
    return 1;
  }

  const { ok, data } = await apiFetch(config, 'DELETE', `/v1/setup/servers/${id}`);
  if (!ok) {
    printError(`Failed to remove: ${JSON.stringify(data)}`);
    return 1;
  }

  printSuccess(`Server ${id} removed`);
  return 0;
}
