interface StatCardProps {
  label: string;
  value: string | number;
  color?: 'emerald' | 'amber' | 'red' | 'zinc';
}

const colorMap = {
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  zinc: 'text-zinc-100',
} as const;

export function StatCard({ label, value, color = 'zinc' }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-xs text-zinc-400 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  );
}
