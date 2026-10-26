'use client';

import { useRouter } from 'next/navigation';
import { useDialogDone } from '@/components/app/form-dialog';
import { t } from '@/lib/i18n';
import { useFormAction } from '@/lib/use-form-action';
import { inputClass } from '../../../components';
import { clearAllData, type ClearState } from './actions';

export function ClearForm({ shopName }: { shopName: string }) {
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction<ClearState>(clearAllData, {});
  useDialogDone(state);
  if (state.done) router.refresh();
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-sm">{t('settings.data.confirmBody')}</p>
      <label className="text-label-sm block">
        {t('settings.data.typeName', { name: shopName })}
        <input name="confirm" required autoComplete="off" className={inputClass} />
      </label>
      <label className="text-label-sm block">
        {t('settings.data.password')}
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-body text-[var(--danger)]">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="bg-destructive text-primary-foreground inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium disabled:opacity-50"
        style={{ background: 'var(--danger)', color: 'var(--on-danger)' }}
      >
        {pending ? t('settings.data.clearing') : t('settings.data.clear')}
      </button>
    </form>
  );
}
