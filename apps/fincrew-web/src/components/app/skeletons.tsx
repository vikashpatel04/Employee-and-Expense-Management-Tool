import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';

/** Placeholder for a tab or a section while it loads (cards and rows). */
export function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label={t('loading')} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder for a whole page: title, actions, then a panel. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label={t('loading')} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <PanelSkeleton />
    </div>
  );
}
