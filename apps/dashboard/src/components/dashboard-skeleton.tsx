import { cn } from '@/lib/utils';

export function DashboardSkeleton() {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px bg-border p-px lg:grid-cols-4',
        '*:w-full *:bg-background/80',
      )}
    >
      <div className="min-h-48 skeleton-shimmer" />
      <div className="min-h-48 skeleton-shimmer [animation-delay:80ms]" />
      <div className="min-h-48 skeleton-shimmer [animation-delay:160ms]" />
      <div className="min-h-48 skeleton-shimmer [animation-delay:240ms]" />
      <div className="col-span-2 min-h-[28.5rem] skeleton-shimmer [animation-delay:120ms] lg:col-span-4" />
      <div className="col-span-2 min-h-[23rem] skeleton-shimmer [animation-delay:200ms]" />
      <div className="col-span-2 min-h-[23rem] skeleton-shimmer [animation-delay:280ms]" />
    </div>
  );
}
