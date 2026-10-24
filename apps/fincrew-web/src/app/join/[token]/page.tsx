import { t } from '@/lib/i18n';
import { supabaseEnv } from '@/lib/supabase/env';
import { AuthCard, buttonClass } from '../../components';

/** The Staffora app opens invite links with this scheme (docs/features/staff-self-service.md). */
const STAFFORA_LINK = (token: string) => `staffora://join/${token}`;

type Invite = { ok: true; name: string; shopName: string } | { ok: false; reason: string };

/** Ask the staff-auth edge function who the invite is for (no sign-in needed). */
async function lookup(token: string): Promise<Invite> {
  const { url, key } = supabaseEnv();
  try {
    const res = await fetch(`${url}/functions/v1/staff-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ action: 'invite', token }),
      cache: 'no-store',
    });
    return (await res.json()) as Invite;
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Public page an invite link opens (PLAN §6.3 first run): who it's for, and the hand-over to
 * the Staffora app, where the person sets their PIN. Nothing is used up by opening this page.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[0-9a-f]{48}$/.test(token)
    ? await lookup(token)
    : ({ ok: false, reason: 'invalid' } as const);

  if (!invite.ok) {
    const reason = ['invalid', 'used', 'expired'].includes(invite.reason)
      ? invite.reason
      : 'failed';
    return (
      <AuthCard title={t('appName')}>
        <p role="alert" className="text-body-lg">
          {t(`join.${reason}`)}
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={t('join.title', { shop: invite.shopName })}
      subtitle={t('join.hello', { name: invite.name })}
    >
      <div className="flex flex-col gap-4">
        <p className="text-body">{t('join.body', { shop: invite.shopName })}</p>
        <a
          href={STAFFORA_LINK(token)}
          className={`${buttonClass} inline-flex items-center justify-center`}
        >
          {t('join.open')}
        </a>
        <p className="text-caption text-[var(--ink-muted)]">{t('join.steps')}</p>
        <p className="text-caption text-[var(--ink-muted)]">{t('join.noApp')}</p>
      </div>
    </AuthCard>
  );
}
