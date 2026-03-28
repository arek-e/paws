interface MiniChartProps {
  data: { timestamp: number; value: number }[];
  label: string;
  color?: string;
  height?: number;
}

export function MiniChart({ data, label, color = '#34d399', height = 120 }: MiniChartProps) {
  if (data.length < 2) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4" style={{ height }}>
        <p className="text-xs text-zinc-400 mb-2">{label}</p>
        <p className="text-zinc-600 text-xs">Collecting data...</p>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const chartWidth = 100;
  const chartHeight = height - 48;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * chartWidth;
      const y = chartHeight - ((d.value - min) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  const current = values[values.length - 1] ?? 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4" style={{ height }}>
      <div className="flex justify-between items-baseline mb-2">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-sm font-mono" style={{ color }}>
          {Number.isInteger(current) ? current : current.toFixed(1)}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        style={{ height: chartHeight }}
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
