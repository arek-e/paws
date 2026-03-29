import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import {
  getProviders,
  provisionServer,
  getProvisioningStatus,
  type Provider,
  type ProvisionStatus,
} from '../api/client.js';
import { Terminal } from '../components/Terminal.js';

interface TerminalLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

interface CheckItem {
  label: string;
  status: 'pending' | 'pass' | 'fail' | 'active';
}

type Phase = 'select' | 'configure' | 'provisioning' | 'complete' | 'error';

export function Provision() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [serverName, setServerName] = useState('');
  const [phase, setPhase] = useState<Phase>('select');
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [_serverId, setServerId] = useState<string | null>(null);
  const [checks, setChecks] = useState<CheckItem[]>([
    { label: 'SSH accessible', status: 'pending' },
    { label: '/dev/kvm available', status: 'pending' },
    { label: 'Firecracker installed', status: 'pending' },
    { label: 'Worker registered', status: 'pending' },
  ]);

  useEffect(() => {
    getProviders()
      .then((p) => {
        setProviders(p);
        setLoading(false);
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load providers');
        setLoading(false);
      });
  }, []);

  function selectProvider(provider: Provider) {
    setSelectedProvider(provider);
    // Initialize form values with empty strings for each field
    const initial: Record<string, string> = {};
    for (const field of provider.fields) {
      initial[field.name] = field.options?.[0]?.value ?? '';
    }
    setFormValues(initial);
    setServerName('');
    setPhase('configure');
  }

  function updateCheck(index: number, status: CheckItem['status']) {
    setChecks((prev) => prev.map((c, i) => (i === index ? { ...c, status } : c)));
  }

  function handleFieldChange(name: string, value: string) {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  }

  function canSubmit(): boolean {
    if (!selectedProvider || serverName.trim().length === 0) return false;
    for (const field of selectedProvider.fields) {
      const val = formValues[field.name];
      if (!val || val.trim().length === 0) return false;
    }
    return true;
  }

  async function startProvisioning() {
    if (!selectedProvider) return;
    setPhase('provisioning');
    setProvisionError(null);
    setLines([]);
    setChecks([
      { label: 'SSH accessible', status: 'pending' },
      { label: '/dev/kvm available', status: 'pending' },
      { label: 'Firecracker installed', status: 'pending' },
      { label: 'Worker registered', status: 'pending' },
    ]);

    try {
      const body: Record<string, string> = {
        provider: selectedProvider.name,
        name: serverName,
        ...formValues,
      };

      const { serverId: id } = await provisionServer(body);
      setServerId(id);

      // Connect to WebSocket for progress streaming
      const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/v1/provisioning/${id}/stream`;
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
            setPhase('complete');
          }
          if (event.stage === 'error') {
            setPhase('error');
            setProvisionError(event.error ?? event.message);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        // Fall back to polling if WS fails
        startPolling(id);
      };

      ws.onclose = () => {
        // If not yet complete, fall back to polling
        setPhase((current) => {
          if (current === 'provisioning') {
            startPolling(id);
          }
          return current;
        });
      };
    } catch (err) {
      setPhase('error');
      setProvisionError(err instanceof Error ? err.message : 'Failed to start provisioning');
    }
  }

  function startPolling(id: string) {
    const interval = setInterval(async () => {
      try {
        const status: ProvisionStatus = await getProvisioningStatus(id);
        if (status.status === 'ready') {
          clearInterval(interval);
          updateCheck(0, 'pass');
          updateCheck(1, 'pass');
          updateCheck(2, 'pass');
          updateCheck(3, 'pass');
          setPhase('complete');
        } else if (status.status === 'error') {
          clearInterval(interval);
          setPhase('error');
          setProvisionError(status.error ?? 'Provisioning failed');
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);
  }

  function resetFlow() {
    setPhase('select');
    setSelectedProvider(null);
    setFormValues({});
    setServerName('');
    setProvisionError(null);
    setLines([]);
    setServerId(null);
    setChecks([
      { label: 'SSH accessible', status: 'pending' },
      { label: '/dev/kvm available', status: 'pending' },
      { label: 'Firecracker installed', status: 'pending' },
      { label: 'Worker registered', status: 'pending' },
    ]);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-100">Provision Server</h1>
        <p className="text-sm text-zinc-500">Loading providers...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-100">Provision Server</h1>
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
          <p className="text-sm text-red-400">{fetchError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Provision Server</h1>
          <p className="text-sm text-zinc-500 mt-1">Add a new worker node to your fleet</p>
        </div>
        {phase !== 'select' && phase !== 'provisioning' && (
          <button
            onClick={resetFlow}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Phase: Select provider */}
      {phase === 'select' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <button
              key={provider.name}
              onClick={() => selectProvider(provider)}
              className="text-left p-5 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-emerald-600/50 hover:bg-zinc-900/80 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg group-hover:bg-emerald-900/30 transition-colors">
                  {provider.name === 'manual' && (
                    <svg
                      className="w-5 h-5 text-zinc-400 group-hover:text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M5 12h14M12 5l7 7-7 7"
                      />
                    </svg>
                  )}
                  {provider.name === 'hetzner-cloud' && (
                    <span className="text-zinc-400 group-hover:text-emerald-400 text-sm font-bold">
                      H
                    </span>
                  )}
                  {provider.name === 'aws-ec2' && (
                    <span className="text-zinc-400 group-hover:text-emerald-400 text-sm font-bold">
                      A
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-zinc-100">{provider.label}</h3>
              </div>
              <p className="text-xs text-zinc-500">{provider.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* Phase: Configure */}
      {phase === 'configure' && selectedProvider && (
        <div className="max-w-lg">
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => setPhase('select')}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-zinc-100">{selectedProvider.label}</h2>
          </div>

          <div className="space-y-4">
            {/* Server name (always present) */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Server Name</label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="e.g. worker-eu-1"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-600"
              />
            </div>

            {/* Dynamic fields */}
            {selectedProvider.fields.map((field) => (
              <div key={field.name}>
                <label className="block text-xs text-zinc-400 mb-1">{field.label}</label>
                {field.type === 'select' && field.options ? (
                  <select
                    value={formValues[field.name] ?? ''}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-emerald-600"
                  >
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={formValues[field.name] ?? ''}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-600"
                  />
                )}
                {field.hint && <p className="text-xs text-zinc-600 mt-1">{field.hint}</p>}
              </div>
            ))}

            <button
              onClick={startProvisioning}
              disabled={!canSubmit()}
              className="mt-2 w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {selectedProvider.name === 'manual' ? 'Connect & Bootstrap' : 'Provision & Bootstrap'}
            </button>
          </div>
        </div>
      )}

      {/* Phase: Provisioning / Complete / Error */}
      {(phase === 'provisioning' || phase === 'complete' || phase === 'error') && (
        <div className="max-w-2xl">
          <Terminal lines={lines} title="Provisioning" />

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
                    ? '\u2713'
                    : check.status === 'fail'
                      ? '\u2717'
                      : check.status === 'active'
                        ? '\u27F3'
                        : '\u25CB'}
                </span>
                <span className={check.status === 'pending' ? 'text-zinc-600' : 'text-zinc-300'}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>

          {phase === 'complete' && (
            <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-800/40 rounded-lg">
              <p className="text-sm text-emerald-400 font-medium">
                Server provisioned successfully!
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Your new worker is ready to accept sessions.
              </p>
              <Link
                to="/"
                className="inline-block mt-3 px-4 py-2 text-sm text-emerald-400 border border-emerald-700/50 rounded-lg hover:bg-emerald-900/20 transition-colors"
              >
                View Fleet
              </Link>
            </div>
          )}

          {phase === 'error' && provisionError && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
              <p className="text-sm text-red-400">{provisionError}</p>
              <button
                onClick={resetFlow}
                className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
