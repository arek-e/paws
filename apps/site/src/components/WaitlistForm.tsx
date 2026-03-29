import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (res.ok) {
        setStatus('success');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || 'Something went wrong. Try again.');
        setStatus('error');
      }
    } catch {
      setErrorMessage('Network error. Try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return <p className="text-sm text-emerald-400">You're on the list. We'll be in touch.</p>;
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-2 w-full max-w-[440px]"
      >
        <Input
          type="email"
          name="email"
          placeholder="you@company.com"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 h-10 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
        />
        <Button
          type="submit"
          disabled={status === 'loading'}
          className="h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[0.9375rem] px-6 whitespace-nowrap"
        >
          {status === 'loading' ? 'Joining...' : 'Join waitlist'}
        </Button>
      </form>
      {status === 'error' && <p className="text-sm text-red-500">{errorMessage}</p>}
    </>
  );
}
