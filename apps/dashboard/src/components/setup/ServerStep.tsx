import { useState } from 'react';

import { Terminal } from '../Terminal.js';

interface TerminalLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

interface ServerStepProps {
  onComplete: (serverId: string) => void;
}

type Tab = 'byo' | 'aws';
type ProvisionStatus = 'idle' | 'provisioning' | 'complete' | 'error';

interface CheckItem {
  label: string;
  status: 'pending' | 'pass' | 'fail' | 'active';
}

export function ServerStep({ onComplete }: ServerStepProps) {
  const [tab, setTab] = useState<Tab>('byo');
  const [status, setStatus] = useState<ProvisionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [_serverId, setServerId] = useState<string | null>(null);

  // BYO fields
  const [ip, setIp] = useState('');
  const [password, setPassword] = useState('');

  // AWS fields
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');

  const [checks, setChecks] = useState<CheckItem[]>([
    { label: 'SSH accessible', status: 'pending' },
    { label: '/dev/kvm available', status: 'pending' },
    { label: 'Firecracker installed', status: 'pending' },
    { label: 'Worker registered', status: 'pending' },
  ]);

  function updateCheck(index: number, status: CheckItem['status']) {
    setChecks((prev) => prev.map((c, i) => (i === index ? { ...c, status } : c)));
  }

  async function startProvisioning() {
    setStatus('provisioning');
    setError(null);
    setLines([]);

    const body =
      tab === 'byo'
        ? { provider: 'manual' as const, ip, password }
        : {
            provider: 'aws-ec2' as const,
            awsAccessKey,
            awsSecretKey,
            region: awsRegion,
            instanceType: 'c8i.xlarge',
          };

    try {
      const res = await fetch('/v1/setup/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Server error: ${res.status}`);
      }

      const { serverId: id } = (await res.json()) as { serverId: string };
      setServerId(id);

      // Connect to WebSocket for progress streaming
      const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/v1/setup/servers/${id}/stream`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (evt) => {
        try {
          const event = JSON.parse(evt.data) as {
            stage: string;
            message: string;
            progress?: number;
            error?: string;
          };

          setLines((prev) => [
            ...prev,
            {
              stream: event.error ? 'stderr' : 'stdout',
              text: event.message,
            },
          ]);

          // Update check items based on stage
          if (event.stage === 'waiting_ssh' && event.message.includes('connected')) {
            updateCheck(0, 'pass');
            updateCheck(1, 'active');
          }
          if (event.stage === 'bootstrapping') {
            if (event.message.includes('/dev/kvm verified')) {
              updateCheck(1, 'pass');
            }
            updateCheck(2, 'active');
            if (event.message === 'Bootstrap complete') {
              updateCheck(2, 'pass');
              updateCheck(3, 'active');
            }
          }
          if (event.stage === 'registering') {
            updateCheck(3, 'active');
          }
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
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setError('WebSocket connection lost');
      };
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start provisioning');
    }
  }

  const canStart =
    tab === 'byo'
      ? ip.length > 0 && password.length > 0
      : awsAccessKey.length > 0 && awsSecretKey.length > 0;

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Add a server</h2>
      <p className="text-sm text-zinc-500 mb-5">Where should your agents run?</p>

      {/* Tabs */}
      <div className="flex rounded-lg border border-zinc-700 overflow-hidden mb-5">
        <button
          onClick={() => setTab('byo')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === 'byo'
              ? 'bg-zinc-800 text-emerald-400'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          I have a server
        </button>
        <button
          onClick={() => setTab('aws')}
          className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-zinc-700 ${
            tab === 'aws'
              ? 'bg-zinc-800 text-emerald-400'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Provision one
        </button>
      </div>

      {status === 'idle' && (
        <>
          {tab === 'byo' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Server IP</label>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="168.119.x.x"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Root password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Used for initial SSH access only"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  We'll install our own SSH key and discard this credential.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">AWS Access Key ID</label>
                <input
                  type="text"
                  value={awsAccessKey}
                  onChange={(e) => setAwsAccessKey(e.target.value)}
                  placeholder="AKIA..."
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">AWS Secret Access Key</label>
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
                c8i.xlarge with nested virtualization (~$0.17/hr). We'll auto-create a security
                group and key pair.
              </p>
            </div>
          )}

          <button
            onClick={startProvisioning}
            disabled={!canStart}
            className="mt-5 w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {tab === 'byo' ? 'Connect & Bootstrap' : 'Provision & Bootstrap'}
          </button>
        </>
      )}

      {status !== 'idle' && (
        <>
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
        </>
      )}
    </div>
  );
}
