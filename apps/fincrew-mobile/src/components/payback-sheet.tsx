import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR, paiseToInput } from '@fincrew/core';
import { payBackExpenses, type PayBackResult } from '@fincrew/data';
import { AmountField, DayStepper, Field, FormMessage } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { Button, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/lib/theme';

const MODES = ['cash', 'upi', 'bank', 'card'] as const;

function payBackError(r: Exclude<PayBackResult, { ok: true }>) {
  switch (r.reason) {
    case 'no_permission':
      return t('payBack.errors.noPermission');
    case 'too_much':
      return t('payBack.errors.tooMuch');
    case 'amount':
      return t('payBack.errors.amount');
    case 'date':
      return t('payBack.errors.date');
    case 'failed':
      return t('payBack.errors.failed', { reason: r.message });
  }
}

/**
 * Pay back now (owner, 29/10/2026): give a staff member the money the shop owes them for
 * expenses they paid, before the salary (`payBackExpenses`, salary.run). The amount starts at
 * `amount` (what's owed, or one expense's amount); the salary then no longer pays it.
 */
export function PayBackSheet({
  open,
  onClose,
  onSaved,
  staffId,
  name,
  owed,
  amount: start,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  staffId: string;
  name: string;
  owed: number;
  amount: number;
}) {
  const { me } = useSession();
  const today = businessDateOf(new Date());
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<string>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(paiseToInput(start));
    setDate(today);
    setMode('cash');
    setNote('');
    setError(null);
  }, [open, start, today]);

  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;

  const save = async () => {
    if (!me) return;
    setBusy(true);
    setError(null);
    const r = await payBackExpenses(supabase, {
      ...me,
      staffId,
      amount,
      date: formatDisplayDate(date),
      mode,
      note,
    });
    setBusy(false);
    if (r.ok) {
      onSaved(t('payBack.done'));
      onClose();
    } else setError(payBackError(r));
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('payBack.title')} subtitle={name}>
      <View style={{ gap: space['space-4'] }}>
        <Text muted>{t('payBack.hint', { name, amount: formatINR(owed) })}</Text>
        <AmountField label={t('payBack.amount')} value={amount} onChange={setAmount} />
        <View style={{ gap: 4 }}>
          <Text variant="caption" muted>
            {t('payBack.date')}
          </Text>
          <DayStepper value={date} onChange={setDate} max={today} />
        </View>
        <View style={{ gap: space['space-2'] }}>
          <Text variant="label-sm">{t('payBack.mode')}</Text>
          <Segmented
            label={t('payBack.mode')}
            value={mode}
            onChange={setMode}
            options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
          />
        </View>
        <Field label={t('payBack.note')} value={note} onChange={setNote} />
        {error && <FormMessage ok={false} text={error} />}
        <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={onClose}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label={busy ? t('payBack.saving') : t('payBack.save')}
              icon={Check}
              busy={busy}
              block
              onPress={() => void save()}
            />
          </View>
        </View>
      </View>
    </Sheet>
  );
}
