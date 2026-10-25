import { t } from '@/lib/i18n';

const block = 'animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-muted)]';

/**
 * Shown in the main area the moment a section link is clicked, while the server loads the
 * page; the sidebar stays. Links prefetch this, so the click answers at once.
 */
export default function Loading() {
  return (
    <div role="status" aria-label={t('loading')} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className={`${block} h-8 w-56`} />
        <div className={`${block} h-5 w-80 max-w-full`} />
      </div>
      <div className={`${block} h-40`} />
      <div className={`${block} h-64`} />
    </div>
  );
}
