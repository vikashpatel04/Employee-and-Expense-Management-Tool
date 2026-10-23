import Link from 'next/link';
import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { AuthCard, buttonClass, inputClass, quietButtonClass } from './components';
import { signOut } from './login/actions';
import { switchShop } from './shops/actions';

export default async function HomePage() {
  const me = await requireMe();

  if (!me) {
    return (
      <AuthCard title={t('appName')}>
        <p className="text-body text-[var(--ink-muted)]">{t('auth.noAccess')}</p>
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
          <p className="text-body text-[var(--ink-muted)]">{me.shopName}</p>
          <h1 className="text-title-xl">{t('home.welcome', { name: me.name })}</h1>
          {me.isOwner && (
            <span className="text-caption mt-2 inline-block rounded-[var(--radius-pill)] bg-[var(--accent-soft)] px-3 py-1 text-[var(--accent-ink)]">
              {t('home.owner')}
            </span>
          )}
        </div>
        <form action={signOut}>
          <button className={quietButtonClass}>{t('auth.signOut')}</button>
        </form>
      </header>

      {(me.memberships.length > 1 || ownsAShop) && (
        <section className="mt-8 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--elevation-1)]">
          {me.memberships.length > 1 && (
            <form action={switchShop} className="flex flex-wrap items-end gap-2">
              <label className="text-label-sm">
                {t('shops.switchLabel')}
                <select id="shopId" name="shopId" defaultValue={me.shopId} className={inputClass}>
                  {me.memberships.map((m) => (
                    <option key={m.shopId} value={m.shopId}>
                      {m.shopName}
                    </option>
                  ))}
                </select>
              </label>
              <button className={quietButtonClass}>{t('shops.switch')}</button>
            </form>
          )}
          {ownsAShop && (
            <Link
              href="/shops/new"
              className={`${quietButtonClass} ml-auto inline-flex items-center`}
            >
              {t('shops.add')}
            </Link>
          )}
        </section>
      )}

      <p className="text-body-lg mt-10 text-[var(--ink-muted)]">{t('home.comingSoon')}</p>
    </main>
  );
}
