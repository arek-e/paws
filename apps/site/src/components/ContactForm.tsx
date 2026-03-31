import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const name = formData.name.trim();
    const email = formData.email.trim();
    const message = formData.message.trim();

    if (!name) {
      setErrorMessage('Name is required.');
      setStatus('error');
      return;
    }
    if (!email) {
      setErrorMessage('Email is required.');
      setStatus('error');
      return;
    }
    if (!message) {
      setErrorMessage('Message is required.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          company: formData.company.trim() || undefined,
          message,
        }),
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
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-emerald-400 text-lg font-semibold mb-2">
          Message sent!
        </p>
        <p className="text-sm text-zinc-400">
          We'll get back to you within 48 hours.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-4 max-w-[560px] mx-auto"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="contact-name"
            className="block text-sm font-medium text-zinc-400 mb-1.5"
          >
            Name <span className="text-red-500">*</span>
          </label>
          <Input
            id="contact-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            value={formData.name}
            onChange={handleChange}
            className="h-10 bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
          />
        </div>
        <div>
          <label
            htmlFor="contact-email"
            className="block text-sm font-medium text-zinc-400 mb-1.5"
          >
            Email <span className="text-red-500">*</span>
          </label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            className="h-10 bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="contact-company"
          className="block text-sm font-medium text-zinc-400 mb-1.5"
        >
          Company <span className="text-zinc-600">(optional)</span>
        </label>
        <Input
          id="contact-company"
          name="company"
          type="text"
          autoComplete="organization"
          value={formData.company}
          onChange={handleChange}
          className="h-10 bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium text-zinc-400 mb-1.5"
        >
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={4}
          value={formData.message}
          onChange={handleChange}
          className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-base text-zinc-100 placeholder:text-zinc-600 transition-colors outline-none focus-visible:border-emerald-400 focus-visible:ring-3 focus-visible:ring-emerald-400/20 md:text-sm resize-none"
        />
      </div>
      <Button
        type="submit"
        disabled={status === 'loading'}
        className="h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[0.9375rem] px-6 w-full sm:w-auto"
      >
        {status === 'loading' ? 'Sending...' : 'Send Message'}
      </Button>
      {status === 'error' && (
        <p className="text-sm text-red-500">{errorMessage}</p>
      )}
    </form>
  );
}
