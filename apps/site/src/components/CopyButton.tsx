import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 text-xs whitespace-nowrap bg-transparent"
    >
      {copied ? 'Copied!' : 'Copy'}
    </Button>
  );
}
