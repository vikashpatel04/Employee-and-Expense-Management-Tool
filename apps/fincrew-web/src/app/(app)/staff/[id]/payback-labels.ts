import { formatINR } from '@fincrew/core';
import { t } from '@/lib/i18n';
import type { PayBackLabels } from './advance-forms';

/** The Pay back now form's words (staff page and expense panel). */
export function payBackLabels(name: string, owed: number): PayBackLabels {
  return {
    hint: t('payBack.hint', { name, amount: formatINR(owed) }),
    amount: t('payBack.amount'),
    date: t('payBack.date'),
    mode: t('payBack.mode'),
    modes: t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>,
    note: t('payBack.note'),
    save: t('payBack.save'),
    saving: t('payBack.saving'),
  };
}
