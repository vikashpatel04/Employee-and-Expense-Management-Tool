import Link from 'next/link';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { AuthCard, buttonClass } from './components';
import { signOut } from './login/actions';
import { switchShop } from './shops/actions';

export default async function HomePage() {
  const me = await requireMe();

  if (!me) {
    return (
      <AuthCard title={t('appName')}>
        <p className="text-sm text-[var(--muted)]">{t('auth.noAccess')}</p>
        <form action={signOut} className="mt-6">
          <button className={buttonClass}>{t('auth.signOut')}</button>
        </form>
      </AuthCard>
    );
  }

  const ownsAShop = me.memberships.some((m) => m.isOwner);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--muted)]">{me.shopName}</p>
          <h1 className="text-2xl font-semibold">{t('home.welcome', { name: me.name })}</h1>
          {me.isOwner && (
            <span className="mt-2 inline-block rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
              {t('home.owner')}
            </span>
          )}
        </div>
        <form action={signOut}>
          <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
            {t('auth.signOut')}
          </button>
        </form>
      </header>

      {(me.memberships.length > 1 || ownsAShop) && (
        <section className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {me.memberships.length > 1 && (
            <form action={switchShop} className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                {t('shops.switchLabel')}
                <select
                  id="shopId"
                  name="shopId"
                  defaultValue={me.shopId}
                  className="mt-1 block rounded-lg border border-[var(--border)] bg-transparent px-3 py-2"
                >
                  {me.memberships.map((m) => (
                    <option key={m.shopId} value={m.shopId}>
                      {m.shopName}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                {t('shops.switch')}
              </button>
            </form>
          )}
          {ownsAShop && (
            <Link
              href="/shops/new"
              className="ml-auto rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              {t('shops.add')}
            </Link>
          )}
        </section>
      )}

      <p className="mt-10 text-[var(--muted)]">{t('home.comingSoon')}</p>
    </main>
  );
}
