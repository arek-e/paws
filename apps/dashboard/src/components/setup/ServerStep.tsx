import { useState } from 'react';

import { Terminal } from '../Terminal.js';

interface TerminalLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

interface ServerStepProps {
  onComplete: (serverId: string) => void;
}

type Provider = null | 'ssh' | 'hetzner' | 'aws' | 'command';
type ProvisionStatus = 'idle' | 'provisioning' | 'complete' | 'error';

interface CheckItem {
  label: string;
  status: 'pending' | 'pass' | 'fail' | 'active';
}

// --- Provider logos (inline SVG) ---

function SshIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M7 15l3-3-3-3" />
      <path d="M13 15h4" />
    </svg>
  );
}

function HetznerLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#D50C2D" />
      <path d="M8 8h4v6h8V8h4v16h-4v-6H12v6H8V8z" fill="white" />
    </svg>
  );
}

function AwsLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#232F3E" />
      <path
        d="M10 18.5c0 .8.3 1.3.8 1.7.5.3 1.2.5 2 .5.6 0 1.1-.1 1.6-.3.5-.2.9-.5 1.2-.9V18c-.4.1-.8.2-1.2.3-.4.1-.8.1-1.2.1-.5 0-.9-.1-1.1-.2-.3-.2-.4-.4-.4-.8v-.2h4v-1c0-.9-.2-1.5-.7-2-.5-.5-1.1-.7-2-.7-.8 0-1.5.3-2 .8-.5.6-.7 1.3-.7 2.2v2zm2.5-3.3c.3 0 .6.1.7.3.2.2.3.5.3.8v.2h-2.1c0-.4.1-.7.3-.9.2-.3.5-.4.8-.4z"
        fill="#FF9900"
      />
      <path
        d="M18 20.7c1.2-.4 2.2-1 2.9-1.7-.1-.1-.2-.2-.3-.4l-.3-.4c-.5.5-1.2.9-2 1.3-.8.3-1.6.5-2.5.5-1.2 0-2.2-.3-3-.8-.8-.5-1.2-1.3-1.2-2.3h.1c.9.4 2 .6 3.1.6 1 0 1.8-.2 2.5-.5.7-.3 1-.8 1-1.4 0-.5-.2-.8-.7-1.1-.4-.3-1.1-.4-2-.4-.7 0-1.3.1-1.8.3-.5.2-.9.4-1.2.7l-.6-.8c.4-.4 1-.7 1.6-.9.7-.2 1.4-.4 2.1-.4 1.1 0 2 .2 2.7.6.7.4 1 1 1 1.7 0 .5-.2 1-.6 1.3-.4.4-1 .6-1.7.8v.1c.8.1 1.5.4 2 .9.5.4.8 1 .8 1.7 0 .4-.1.8-.3 1.1z"
        fill="#FF9900"
      />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

const PROVIDERS: { id: Provider; label: string; desc: string; icon: () => JSX.Element }[] = [
  {
    id: 'ssh',
    label: 'Connect a server',
    desc: 'SSH into any server with /dev/kvm',
    icon: SshIcon,
  },
  {
    id: 'hetzner',
    label: 'Hetzner Dedicated',
    desc: 'Provision bare metal via Robot API',
    icon: HetznerLogo,
  },
  {
    id: 'aws',
    label: 'AWS EC2',
    desc: 'Launch an instance with KVM support',
    icon: AwsLogo,
  },
  {
    id: 'command',
    label: 'Run a command',
    desc: 'Copy a script and run it yourself',
    icon: CommandIcon,
  },
];

export function ServerStep({ onComplete }: ServerStepProps) {
  const [provider, setProvider] = useState<Provider>(null);
  const [status, setStatus] = useState<ProvisionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [_serverId, setServerId] = useState<string | null>(null);

  // SSH fields
  const [ip, setIp] = useState('');
  const [password, setPassword] = useState('');
  const [serverName, setServerName] = useState('');

  // AWS fields
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');

  // Hetzner fields
  const [hetznerUser, setHetznerUser] = useState('');
  const [hetznerPass, setHetznerPass] = useState('');

  const [checks, setChecks] = useState<CheckItem[]>([
    { label: 'SSH accessible', status: 'pending' },
    { label: '/dev/kvm available', status: 'pending' },
    { label: 'Firecracker installed', status: 'pending' },
    { label: 'Worker registered', status: 'pending' },
  ]);

  function updateCheck(index: number, s: CheckItem['status']) {
    setChecks((prev) => prev.map((c, i) => (i === index ? { ...c, status: s } : c)));
  }

  async function startProvisioning() {
    setStatus('provisioning');
    setError(null);
    setLines([]);

    let body: Record<string, unknown>;
    if (provider === 'ssh') {
      body = { provider: 'manual', name: serverName || 'worker-1', ip, password };
    } else if (provider === 'aws') {
      body = {
        provider: 'aws-ec2',
        name: 'aws-worker',
        awsAccessKey,
        awsSecretKey,
        region: awsRegion,
      };
    } else {
      return;
    }

    try {
      const res = await fetch('/v1/setup/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: { message?: string } }).error?.message ?? `Error: ${res.status}`,
        );
      }

      const { serverId: id } = (await res.json()) as { serverId: string };
      setServerId(id);

      const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/v1/setup/servers/${id}/stream`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data) as {
            stage: string;
            message: string;
            error?: string;
          };

          setLines((prev) => [
            ...prev,
            { stream: event.error ? 'stderr' : 'stdout', text: event.message },
          ]);

          if (event.stage === 'waiting_ssh' && event.message.includes('connected'))
            updateCheck(0, 'pass');
          if (event.message.includes('/dev/kvm verified')) updateCheck(1, 'pass');
          if (event.message === 'Bootstrap complete') updateCheck(2, 'pass');
          if (event.stage === 'ready') {
            updateCheck(3, 'pass');
            setStatus('complete');
            onComplete(id);
          }
          if (event.stage === 'error') {
            setStatus('error');
            setError(event.error ?? event.message);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setError('Connection lost');
      };
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  // Provider selection cards
  if (!provider) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 mb-1">Add a worker server</h2>
        <p className="text-sm text-zinc-500 mb-6">
          Workers run your AI agents in isolated Firecracker VMs. You need a server with{' '}
          <code className="text-zinc-400">/dev/kvm</code> (bare metal or nested virtualization).
        </p>

        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className="flex flex-col items-center gap-3 p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-emerald-500/50 hover:bg-zinc-800/50 transition-all text-center group"
            >
              <div className="text-zinc-400 group-hover:text-emerald-400 transition-colors">
                <p.icon />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">{p.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{p.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Command mode — just show the curl command
  if (provider === 'command') {
    const cmd = `curl -fsSL ${location.origin}/v1/setup/worker-script | bash`;
    return (
      <div>
        <button
          onClick={() => setProvider(null)}
          className="text-xs text-zinc-500 hover:text-zinc-300 mb-4"
        >
          ← Back
        </button>
        <h2 className="text-xl font-semibold text-zinc-100 mb-1">Run on your server</h2>
        <p className="text-sm text-zinc-500 mb-4">SSH into your server and run this command:</p>
        <div
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 cursor-pointer hover:border-zinc-700 transition-colors"
          onClick={() => navigator.clipboard.writeText(cmd)}
        >
          <code className="text-sm text-emerald-400 font-mono break-all">{cmd}</code>
          <p className="text-xs text-zinc-600 mt-2">Click to copy</p>
        </div>
        <p className="text-xs text-zinc-600 mt-3">
          The server needs: Linux, root access, /dev/kvm. The script installs Firecracker and
          connects the worker to this control plane.
        </p>
        <button
          onClick={() => onComplete('manual')}
          className="mt-6 w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
        >
          I've run it, continue →
        </button>
      </div>
    );
  }

  // Hetzner — coming soon placeholder
  if (provider === 'hetzner' && status === 'idle') {
    return (
      <div>
        <button
          onClick={() => setProvider(null)}
          className="text-xs text-zinc-500 hover:text-zinc-300 mb-4"
        >
          ← Back
        </button>
        <h2 className="text-xl font-semibold text-zinc-100 mb-1">Hetzner Dedicated</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Provision a Hetzner dedicated server via the Robot API.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Robot API User</label>
            <input
              type="text"
              value={hetznerUser}
              onChange={(e) => setHetznerUser(e.target.value)}
              placeholder="#ws+xxxxx"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Robot API Password</label>
            <input
              type="password"
              value={hetznerPass}
              onChange={(e) => setHetznerPass(e.target.value)}
              placeholder="Your Robot API password"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <p className="text-xs text-zinc-600">
            Get credentials at{' '}
            <a
              href="https://robot.hetzner.com/preferences/index"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline"
            >
              robot.hetzner.com
            </a>
            . We'll provision an AX-series server (~€40/mo).
          </p>
        </div>
        <button
          onClick={startProvisioning}
          disabled={!hetznerUser || !hetznerPass}
          className="mt-5 w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 transition-colors"
        >
          Provision Server
        </button>
      </div>
    );
  }

  // SSH + AWS forms
  if (status === 'idle') {
    return (
      <div>
        <button
          onClick={() => setProvider(null)}
          className="text-xs text-zinc-500 hover:text-zinc-300 mb-4"
        >
          ← Back
        </button>

        {provider === 'ssh' ? (
          <>
            <h2 className="text-xl font-semibold text-zinc-100 mb-1">Connect your server</h2>
            <p className="text-sm text-zinc-500 mb-4">
              We'll SSH in, verify /dev/kvm, install Firecracker, and connect the worker.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Server name</label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="worker-01"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">IP address</label>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="65.108.x.x"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Root password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="SSH password"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Used once for setup. We install our own SSH key and discard this.
                </p>
              </div>
            </div>
            <button
              onClick={startProvisioning}
              disabled={!ip || !password}
              className="mt-5 w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 transition-colors"
            >
              Connect & Bootstrap
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-zinc-100 mb-1">Launch on AWS EC2</h2>
            <p className="text-sm text-zinc-500 mb-4">
              We'll launch a KVM-capable EC2 instance, bootstrap it, and connect.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Access Key ID</label>
                <input
                  type="text"
                  value={awsAccessKey}
                  onChange={(e) => setAwsAccessKey(e.target.value)}
                  placeholder="AKIA..."
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Secret Access Key</label>
                <input
                  type="password"
                  value={awsSecretKey}
                  onChange={(e) => setAwsSecretKey(e.target.value)}
                  placeholder="Your secret key"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Region</label>
                <select
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100"
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU (Ireland)</option>
                  <option value="eu-central-1">EU (Frankfurt)</option>
                  <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                </select>
              </div>
              <p className="text-xs text-zinc-600">
                c7i.xlarge with nested virtualization (~$0.17/hr).
              </p>
            </div>
            <button
              onClick={startProvisioning}
              disabled={!awsAccessKey || !awsSecretKey}
              className="mt-5 w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 transition-colors"
            >
              Launch & Bootstrap
            </button>
          </>
        )}
      </div>
    );
  }

  // Provisioning progress
  return (
    <div>
      <Terminal lines={lines} title="Bootstrap" />

      <div className="mt-4 space-y-2">
        {checks.map((check, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${
                check.status === 'pass'
                  ? 'bg-emerald-900/40 text-emerald-400'
                  : check.status === 'fail'
                    ? 'bg-red-900/40 text-red-400'
                    : check.status === 'active'
                      ? 'bg-blue-900/40 text-blue-400 animate-pulse'
                      : 'bg-zinc-800 text-zinc-600'
              }`}
            >
              {check.status === 'pass'
                ? '✓'
                : check.status === 'fail'
                  ? '✗'
                  : check.status === 'active'
                    ? '⟳'
                    : '○'}
            </span>
            <span className={check.status === 'pending' ? 'text-zinc-600' : 'text-zinc-300'}>
              {check.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => {
              setStatus('idle');
              setError(null);
              setLines([]);
              setChecks((prev) => prev.map((c) => ({ ...c, status: 'pending' as const })));
            }}
            className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
