import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils.js';

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(label ? `Copied ${label}` : 'Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void handleCopy();
      }}
      className={cn(
        'inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors',
        className,
      )}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function Copyable({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        void handleCopy();
      }}
      className={cn('inline-flex items-center gap-1 cursor-pointer group', className)}
      title="Click to copy"
    >
      {children}
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      )}
    </span>
  );
}
