import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CalendarClock, Check, Pencil } from 'lucide-react-native';
import {
  businessDateOf,
  formatDisplayDate,
  formatINR,
  formatTimeOfDay,
  paiseToInput,
} from '@fincrew/core';
import { loadPay, saveAdvanceSettings } from '@fincrew/data';
import { AmountField, FormMessage } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { Button, Card, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type Pay = Awaited<ReturnType<typeof loadPay>>;

function Row({ label, detail, value }: { label: string; detail?: string; value: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space['space-3'],
        minHeight: 56,
        paddingHorizontal: space['space-4'],
        paddingVertical: space['space-2'],
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label-sm">{label}</Text>
        {detail ? (
          <Text variant="caption" muted>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text variant="money-sm" style={{ textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Staff detail · Pay (design: Staff detail · Pay): current pay, advance rules, allowances,
 * deductions, history. "Change pay from a date" (staff.pay.edit) opens `pay-change`; advance
 * limit and monthly cut change in a sheet (staff.edit, shared `saveAdvanceSettings`). Allowances,
 * deductions, leave template and own rules still change on the website.
 */
export function PaySection({
  staffId,
  name,
  advanceLimit,
  advanceCut,
  onChanged,
}: {
  staffId: string;
  name: string;
  advanceLimit: number | null;
  advanceCut: number | null;
  /** Reload the staff page after the advance rules change. */
  onChanged: () => void;
}) {
  const { me, can } = useSession();
  const [pay, setPay] = useState<Pay | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [limit, setLimit] = useState('');
  const [cut, setCut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Reload whenever the screen comes back into view (after "Change pay from a date").
  useFocusEffect(
    useCallback(() => {
      void loadPay(supabase, staffId, businessDateOf(new Date())).then(setPay);
    }, [staffId]),
  );

  const openRules = () => {
    setLimit(advanceLimit == null ? '' : paiseToInput(advanceLimit));
    setCut(advanceCut == null ? '' : paiseToInput(advanceCut));
    setError(null);
    setSaved(null);
    setRulesOpen(true);
  };
  const saveRules = async () => {
    if (!me) return;
    setBusy(true);
    const r = await saveAdvanceSettings(supabase, { ...me, staffId, limit, cut });
    setBusy(false);
    if (r.ok) {
      setRulesOpen(false);
      setSaved(t('advances.done.settings'));
      onChanged();
    } else
      setError(
        r.reason === 'no_permission'
          ? t('advances.errors.noPermission')
          : r.reason === 'amount'
            ? t('staffDetail.pay.form.errors.amount')
            : t('advances.errors.failed', { reason: r.message }),
      );
  };

  if (!pay) return null;
  const p = 'staffDetail.pay';
  const m = 'mobile.staff';
  const cur = pay.current;

  return (
    <View style={{ gap: space['space-4'] }}>
      {!cur ? (
        <Text muted>{t(`${p}.none`)}</Text>
      ) : (
        <View style={{ gap: space['space-2'] }}>
          <Text variant="title-md">{t(`${p}.current`)}</Text>
          <Card>
            <Row
              label={t(`${p}.amount.${cur.payType}`)}
              detail={`${t(`${p}.types.${cur.payType}`)} · ${t(`${p}.since`, { date: formatDisplayDate(cur.since) })}`}
              value={formatINR(cur.amount)}
            />
            {cur.overtime != null && (
              <Row label={t(`${p}.overtime`)} value={formatINR(cur.overtime)} />
            )}
            <Row
              label={t(`${p}.shift`)}
              detail={cur.shiftStart != null ? t(`${p}.grace`, { minutes: cur.grace }) : undefined}
              value={
                cur.shiftStart != null && cur.shiftEnd != null
                  ? `${formatTimeOfDay(cur.shiftStart)} – ${formatTimeOfDay(cur.shiftEnd)}`
                  : t(`${p}.noShift`)
              }
            />
            <Row
              label={t(`${p}.template`)}
              detail={
                pay.template
                  ? t(`${p}.templateSince`, { date: formatDisplayDate(pay.template.since) })
                  : undefined
              }
              value={pay.template?.name ?? t(`${p}.noTemplate`)}
            />
            <Row
              label={t('staffDetail.rules.label')}
              value={
                cur.ownRules > 0
                  ? t('mobile.staff.ownRules', { count: cur.ownRules })
                  : t('mobile.staff.shopRules')
              }
            />
          </Card>
        </View>
      )}
      {can('staff.pay.edit') && (
        <Button
          label={t(`${p}.change`)}
          icon={CalendarClock}
          variant="secondary"
          block
          onPress={() => router.push({ pathname: '/pay-change', params: { staff: staffId, name } })}
        />
      )}

      <View style={{ gap: space['space-2'] }}>
        <Text variant="title-md">{t(`${m}.advanceRules`)}</Text>
        {saved && <FormMessage ok text={saved} />}
        <Card>
          <Row
            label={t(`${m}.advanceLimit`)}
            value={advanceLimit == null ? t(`${m}.noLimit`) : formatINR(advanceLimit)}
          />
          <Row
            label={t(`${m}.advanceCut`)}
            value={advanceCut == null ? t(`${m}.cutAtRun`) : formatINR(advanceCut)}
          />
        </Card>
        {can('staff.edit') && (
          <Button
            label={t('advances.settings.title')}
            icon={Pencil}
            variant="quiet"
            block
            onPress={openRules}
          />
        )}
      </View>

      {(
        [
          [t(`${p}.allowances`), pay.allowances],
          [t(`${p}.deductions`), pay.deductions],
        ] as const
      ).map(
        ([title, items]) =>
          items.length > 0 && (
            <View key={title} style={{ gap: space['space-2'] }}>
              <Text variant="title-md">{title}</Text>
              <Card>
                {items.map((a) => (
                  <Row
                    key={a.id}
                    label={a.ended ? `${a.name} · ${t('mobile.staff.ended')}` : a.name}
                    detail={[
                      a.prorated ? t(`${p}.prorated`) : t(`${p}.fixed`),
                      t(`${p}.since`, { date: formatDisplayDate(a.from) }),
                      a.to ? t('mobile.staff.until', { date: formatDisplayDate(a.to) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    value={formatINR(a.amount)}
                  />
                ))}
              </Card>
            </View>
          ),
      )}

      {pay.history.length > 0 && (
        <View style={{ gap: space['space-2'] }}>
          <Text variant="title-md">{t(`${p}.history`)}</Text>
          <Card>
            {pay.history.map((h) => (
              <Row
                key={h.id}
                label={t(`${p}.since`, { date: formatDisplayDate(h.since) })}
                detail={t(`${p}.types.${h.payType}`)}
                value={formatINR(h.amount)}
              />
            ))}
          </Card>
        </View>
      )}
      <Text variant="caption" muted>
        {t('mobile.staff.changeOnWebsite')}
      </Text>

      <Sheet
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title={t('advances.settings.title')}
        subtitle={name}
      >
        <AmountField label={t('advances.settings.limit')} value={limit} onChange={setLimit} />
        <AmountField label={t('advances.settings.cut')} value={cut} onChange={setCut} />
        {error && <FormMessage ok={false} text={error} />}
        <View style={{ marginTop: space['space-3'] }}>
          <Button
            label={busy ? t('advances.saving') : t('advances.settings.save')}
            icon={Check}
            busy={busy}
            block
            onPress={() => void saveRules()}
          />
        </View>
      </Sheet>
    </View>
  );
}
