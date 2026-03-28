import { useState } from 'react';
import { useNavigate } from 'react-router';

import { CredentialsStep } from '../components/setup/CredentialsStep.js';
import { FirstRunStep } from '../components/setup/FirstRunStep.js';
import { GitHubStep } from '../components/setup/GitHubStep.js';
import { ServerStep } from '../components/setup/ServerStep.js';

type Step = 'server' | 'credentials' | 'github' | 'first-run';

const STEPS: { id: Step; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'github', label: 'GitHub' },
  { id: 'first-run', label: 'First Run' },
];

export function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('server');
  const [_serverId, setServerId] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <pre className="text-emerald-400 text-xs leading-tight font-mono">{` /\\_/\\
( o.o )  setup
 > ^ <`}</pre>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < stepIndex ? 'bg-emerald-500' : i === stepIndex ? 'bg-blue-500' : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>

      {/* Step label */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-zinc-500">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
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
        <CredentialsStep onComplete={() => setStep('github')} onBack={() => setStep('server')} />
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
  );
}
