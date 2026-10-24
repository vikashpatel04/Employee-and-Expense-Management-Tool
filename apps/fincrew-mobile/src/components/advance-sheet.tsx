import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR } from '@fincrew/core';
import { recordAdvance, type AdvanceWriteResult } from '@fincrew/data';
import { AmountField, DayStepper, Field, FormMessage, Notice } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { Avatar, Button, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

export type AdvancePerson = {
  staffId: string;
  name: string;
  outstanding?: number;
  limit?: number | null;
};

const MODES = ['cash', 'upi', 'bank', 'card'] as const;

function advanceError(r: Exclude<AdvanceWriteResult, { ok: true }>) {
  switch (r.reason) {
    case 'no_permission':
      return t('advances.errors.noPermission');
    case 'amount':
      return t('staffDetail.pay.form.errors.amount');
    case 'date':
      return t('common.invalidDate');
    case 'over_limit':
      return t('mobile.money.advances.overLimit');
    case 'failed':
      return t('advances.errors.failed', { reason: r.message });
  }
}

/**
 * Give an advance or record cash paid back (design: "Money · advances, give"). Saves through
 * `recordAdvance` (`@fincrew/data`); past the person's limit the database refuses, and the sheet
 * asks "Give anyway" before sending it again confirmed (PLAN §4.7). With no `person` given it
 * first asks who.
 */
export function AdvanceSheet({
  open,
  onClose,
  onSaved,
  person,
  people = [],
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  person: AdvancePerson | null;
  /** Who can be picked when `person` is null. */
  people?: AdvancePerson[];
}) {
  const { me } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const [who, setWho] = useState<AdvancePerson | null>(person);
  const [kind, setKind] = useState<'given' | 'repaid'>('given');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<string>('cash');
  const [note, setNote] = useState('');
  const [overLimit, setOverLimit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWho(person);
    setKind('given');
    setAmount('');
    setDate(today);
    setNote('');
    setOverLimit(false);
    setError(null);
  }, [open, person, today]);

  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const a = 'mobile.money.advances';

  const save = async () => {
    if (!me || !who) return;
    setBusy(true);
    setError(null);
    const r = await recordAdvance(supabase, {
      ...me,
      staffId: who.staffId,
      kind,
      amount,
      date: formatDisplayDate(date),
      mode,
      note,
      confirmOverLimit: overLimit,
    });
    setBusy(false);
    if (r.ok) {
      onSaved(t(r.kind === 'given' ? 'advances.done.given' : 'advances.done.repaid'));
      onClose();
    } else if (r.reason === 'over_limit') {
      setOverLimit(true);
    } else {
      setError(advanceError(r));
    }
  };

  const sub =
    who && who.outstanding !== undefined
      ? [
          t(`${a}.owes`, { amount: formatINR(who.outstanding) }),
          who.limit != null ? t(`${a}.limit`, { amount: formatINR(who.limit) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={who ? who.name : t(`${a}.who`)}
      subtitle={who ? sub : undefined}
    >
      {!who ? (
        people.map((p) => (
          <Pressable
            key={p.staffId}
            accessibilityRole="button"
            onPress={() => setWho(p)}
            style={{
              minHeight: 56,
              paddingHorizontal: space['space-3'],
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['space-3'],
              borderRadius: radius['radius-md'],
              backgroundColor: c['surface-muted'],
            }}
          >
            <Avatar name={p.name} size={36} />
            <Text variant="label" style={{ flex: 1 }}>
              {p.name}
            </Text>
            {p.outstanding ? (
              <Text variant="money-sm" color={c['money-advance']}>
                {formatINR(p.outstanding)}
              </Text>
            ) : null}
          </Pressable>
        ))
      ) : (
        <View style={{ gap: space['space-4'] }}>
          <Segmented
            label={t('advances.kind.label')}
            value={kind}
            onChange={(v) => {
              setKind(v);
              setOverLimit(false);
            }}
            options={[
              { value: 'given', label: t('advances.give') },
              { value: 'repaid', label: t(`${a}.paidBack`) },
            ]}
          />
          <AmountField
            label={t('advances.fields.amount')}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setOverLimit(false);
            }}
          />
          <View style={{ gap: 4 }}>
            <Text variant="caption" muted>
              {t('advances.fields.date')}
            </Text>
            <DayStepper value={date} onChange={setDate} max={today} />
          </View>
          <View style={{ gap: space['space-2'] }}>
            <Text variant="label-sm">{t('advances.fields.mode')}</Text>
            <Segmented
              label={t('advances.fields.mode')}
              value={mode}
              onChange={setMode}
              options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
            />
          </View>
          <Field label={t('advances.fields.note')} value={note} onChange={setNote} />
          {overLimit && <Notice title={t(`${a}.overLimit`, { name: who.name })} />}
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
                label={
                  overLimit
                    ? t(`${a}.giveAnyway`)
                    : busy
                      ? t('advances.saving')
                      : kind === 'given'
                        ? t('advances.give')
                        : t('advances.repaid')
                }
                icon={Check}
                busy={busy}
                block
                onPress={save}
              />
            </View>
          </View>
        </View>
      )}
    </Sheet>
  );
}
