import Link from 'next/link';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { Me } from '@/lib/session';
import { Avatar } from '../components';
import { switchShop } from '../shops/actions';

/** Current shop at the top of the sidebar; opens a list of the person's shops (design: shop switcher). */
export function ShopSwitcher({ me }: { me: Me }) {
  const ownsAShop = me.memberships.some((m) => m.isOwner);
  const count = me.memberships.length;

  return (
    <details className="group relative mb-3">
      <summary
        aria-label={t('nav.switchShop', { name: me.shopName })}
        className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-2.5 py-2 focus-visible:outline-2 focus-visible:outline-[var(--focus)] [&::-webkit-details-marker]:hidden"
      >
        <Avatar name={me.shopName} size={36} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-label-sm truncate">{me.shopName}</span>
          <span className="text-caption text-[var(--ink-muted)]">
            {t('nav.shopCount', { count })}
          </span>
        </span>
        <ChevronDown size={20} aria-hidden="true" className="transition group-open:rotate-180" />
      </summary>
      <div className="absolute inset-x-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--surface)] p-1 shadow-[var(--elevation-2)]">
        {me.memberships.map((m) => (
          <form key={m.shopId} action={switchShop}>
            <input type="hidden" name="shopId" value={m.shopId} />
            <button
              className="text-body flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-left hover:bg-[var(--surface-muted)]"
              aria-current={m.shopId === me.shopId ? 'true' : undefined}
            >
              <span className="flex-1 truncate">{m.shopName}</span>
              {m.shopId === me.shopId && <Check size={18} aria-hidden="true" />}
            </button>
          </form>
        ))}
        {ownsAShop && (
          <Link
            href="/shops/new"
            className="text-label-sm flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-[var(--accent-ink)] hover:bg-[var(--surface-muted)]"
          >
            <Plus size={18} aria-hidden="true" />
            {t('shops.add')}
          </Link>
        )}
      </div>
    </details>
  );
}
