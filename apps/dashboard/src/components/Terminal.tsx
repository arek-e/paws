import { useEffect, useRef } from 'react';

interface TerminalLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

interface TerminalProps {
  lines: TerminalLine[];
  title?: string;
}

export function Terminal({ lines, title = 'Output' }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="bg-black rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-zinc-500 ml-2">{title}</span>
      </div>
      <div className="p-4 font-mono text-sm h-80 overflow-auto">
        {lines.length === 0 && (
          <p className="text-zinc-600">
            <span className="animate-pulse">_</span> Waiting for output...
          </p>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all ${line.stream === 'stderr' ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {line.text || '\u00A0'}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
