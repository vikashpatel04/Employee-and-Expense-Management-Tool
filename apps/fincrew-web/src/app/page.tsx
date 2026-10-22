import { t } from '@/lib/i18n';
import { requireMe } from '@/lib/session';
import { AuthCard, buttonClass } from './components';
import { signOut } from './login/actions';

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex items-center justify-between gap-4">
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
      <p className="mt-10 text-[var(--muted)]">{t('home.comingSoon')}</p>
    </main>
  );
}
