import { Card, CardContent } from '@/components/ui/card';

interface StatCardProps {
  label: string;
  value: string | number;
  color?: 'emerald' | 'amber' | 'red' | 'zinc';
}

const colorMap = {
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  zinc: 'text-foreground',
} as const;

export function StatCard({ label, value, color = 'zinc' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
