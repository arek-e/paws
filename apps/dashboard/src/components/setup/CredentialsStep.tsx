import { useEffect, useState } from 'react';

interface Credential {
  provider: string;
  masked: string;
  headerName: string;
  createdAt: string;
}

interface CredentialsStepProps {
  onComplete: () => void;
  onBack: () => void;
}

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', icon: '🤖', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', icon: '🧠', placeholder: 'sk-...' },
  { id: 'github', name: 'GitHub', icon: '🐙', placeholder: 'ghp_... or github_pat_...' },
] as const;

export function CredentialsStep({ onComplete, onBack }: CredentialsStepProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCredentials();
  }, []);

  async function fetchCredentials() {
    try {
      const res = await fetch('/v1/setup/credentials', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { credentials: Credential[] };
        setCredentials(data.credentials);
      }
    } catch {
      // ignore
    }
  }

  async function saveCredential(provider: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/v1/setup/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, apiKey: inputValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Failed: ${res.status}`);
      }

      setEditing(null);
      setInputValue('');
      await fetchCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const hasLlmProvider = credentials.some(
    (c) => c.provider === 'anthropic' || c.provider === 'openai',
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Add credentials</h2>
      <p className="text-sm text-zinc-500 mb-5">
        These never enter the VM. They're injected at the network layer by the proxy.
      </p>

      <div className="space-y-3">
        {PROVIDERS.map((prov) => {
          const cred = credentials.find((c) => c.provider === prov.id);
          const isEditing = editing === prov.id;

          return (
            <div
              key={prov.id}
              className={`border rounded-lg p-3 transition-colors ${
                cred ? 'border-emerald-700 bg-emerald-900/10' : 'border-zinc-700 bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{prov.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">{prov.name}</p>
                  {cred && !isEditing && (
                    <p className="text-xs text-emerald-400">✓ {cred.masked} configured</p>
                  )}
                  {!cred && !isEditing && <p className="text-xs text-zinc-500">Not configured</p>}
                </div>
                {!isEditing && (
                  <button
                    onClick={() => {
                      setEditing(prov.id);
                      setInputValue('');
                      setError(null);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {cred ? 'Edit' : '+ Add'}
                  </button>
                )}
              </div>

              {isEditing && (
                <div className="mt-3">
                  <input
                    type="password"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={prov.placeholder}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600"
                    autoFocus
                  />
                  {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => saveCredential(prov.id)}
                      disabled={!inputValue || saving}
                      className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-md hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null);
                        setError(null);
                      }}
                      className="px-3 py-1.5 bg-zinc-700 text-zinc-300 text-xs rounded-md hover:bg-zinc-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Security callout */}
      <div className="mt-4 p-3 bg-blue-900/10 border border-blue-800/30 rounded-lg">
        <p className="text-xs text-blue-300">
          🔒 <strong>Zero-trust:</strong> Credentials are stored encrypted in the control plane.
          They're injected into HTTP requests by the per-VM TLS proxy. The VM never sees them.
        </p>
      </div>

      {!hasLlmProvider && (
        <p className="text-xs text-zinc-500 mt-3 italic">
          At least one LLM provider (Anthropic or OpenAI) required.
        </p>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onComplete}
          disabled={!hasLlmProvider}
          className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
