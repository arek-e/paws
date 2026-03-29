import { useState } from 'react';
import { useNavigate } from 'react-router';

import { CredentialsStep } from '../components/setup/CredentialsStep.js';
import { FirstRunStep } from '../components/setup/FirstRunStep.js';
import { GitHubStep } from '../components/setup/GitHubStep.js';
import { ServerStep } from '../components/setup/ServerStep.js';

type Step = 'server' | 'credentials' | 'github' | 'first-run';

const STEPS: { id: Step; label: string }[] = [
  { id: 'server', label: 'Add Worker' },
  { id: 'credentials', label: 'API Keys' },
  { id: 'github', label: 'GitHub' },
  { id: 'first-run', label: 'First Agent' },
];

export function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('server');
  const [_serverId, setServerId] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <pre className="text-emerald-400 text-xs leading-tight font-mono">{` /\\_/\\
( o.o )
 > ^ <`}</pre>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">paws setup</h1>
            <p className="text-xs text-zinc-500">Let's get your agent infrastructure running</p>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.setItem('paws_setup_skipped', 'true');
            navigate('/');
          }}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Skip setup →
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-start justify-center pt-12 px-4">
        <div className="w-full max-w-lg">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    i < stepIndex
                      ? 'bg-emerald-500 text-white'
                      : i === stepIndex
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/30'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                <span
                  className={`text-xs hidden sm:inline ${
                    i <= stepIndex ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px ${i < stepIndex ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          {step === 'server' && (
            <ServerStep
              onComplete={(id) => {
                setServerId(id);
                setStep('credentials');
              }}
            />
          )}

          {step === 'credentials' && (
            <CredentialsStep
              onComplete={() => setStep('github')}
              onBack={() => setStep('server')}
            />
          )}

          {step === 'github' && (
            <div>
              <GitHubStep />
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setStep('credentials')}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep('first-run')}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'first-run' && (
            <FirstRunStep onComplete={() => navigate('/')} onBack={() => setStep('github')} />
          )}
        </div>
      </div>
    </div>
  );
}
