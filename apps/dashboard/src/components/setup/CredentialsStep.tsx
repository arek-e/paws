import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';

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
            <Card
              key={prov.id}
              className={`p-3 gap-0 ${
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
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => {
                      setEditing(prov.id);
                      setInputValue('');
                      setError(null);
                    }}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {cred ? 'Edit' : '+ Add'}
                  </Button>
                )}
              </div>

              {isEditing && (
                <div className="mt-3">
                  <Input
                    type="password"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={prov.placeholder}
                    className="bg-zinc-800 border-zinc-600 text-zinc-100 placeholder:text-zinc-600"
                    autoFocus
                  />
                  {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => saveCredential(prov.id)}
                      disabled={!inputValue || saving}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(null);
                        setError(null);
                      }}
                      className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Security callout */}
      <Alert className="mt-4 bg-blue-900/10 border-blue-800/30">
        <AlertDescription className="text-xs text-blue-300">
          🔒 <strong>Zero-trust:</strong> Credentials are stored encrypted in the control plane.
          They're injected into HTTP requests by the per-VM TLS proxy. The VM never sees them.
        </AlertDescription>
      </Alert>

      {!hasLlmProvider && (
        <p className="text-xs text-zinc-500 mt-3 italic">
          At least one LLM provider (Anthropic or OpenAI) required.
        </p>
      )}

      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onBack} className="text-zinc-400 hover:text-zinc-200">
          ← Back
        </Button>
        <Button
          onClick={onComplete}
          disabled={!hasLlmProvider}
          className="bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
