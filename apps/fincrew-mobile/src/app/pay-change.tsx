import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, minutesToInput, paiseToInput } from '@fincrew/core';
import { loadPay, PAY_TYPES, savePay, type PayType, type PayWriteResult } from '@fincrew/data';
import { AmountField, BottomBar, Field, FormMessage } from '@/components/form';
import { Button, IconButton, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

const f = 'staffDetail.pay.form';

/** A refused save → the website's message for the same reason. */
function payError(r: Exclude<PayWriteResult, { ok: true }>): string {
  switch (r.reason) {
    case 'no_permission':
      return t('advances.errors.noPermission');
    case 'date':
      return t('common.invalidDate');
    case 'failed':
      return t(`${f}.errors.failed`, { reason: r.message });
    default:
      return t(`${f}.errors.${r.reason}`);
  }
}

/**
 * Change pay from a date (staff.pay.edit; the website's "Change pay from a date" form, design
 * "Staff detail · Pay" button): prefilled with the pay in effect today, so a raise is one field.
 * Saves a dated version with the shared `savePay` (`@fincrew/data`); earlier months keep the pay
 * that applied then. Opened from Staff detail · Pay with `?staff=<id>&name=<name>`.
 */
export default function PayChange() {
  const params = useLocalSearchParams<{ staff: string; name?: string }>();
  const { me } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const [from, setFrom] = useState(formatDisplayDate(today));
  const [payType, setPayType] = useState<PayType>('monthly');
  const [amount, setAmount] = useState('');
  const [overtime, setOvertime] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [grace, setGrace] = useState('10');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.staff) return;
    void loadPay(supabase, params.staff, today).then(({ current: cur }) => {
      if (!cur) return;
      setPayType(cur.payType);
      setAmount(paiseToInput(cur.amount));
      setOvertime(cur.overtime == null ? '' : paiseToInput(cur.overtime));
      setShiftStart(cur.shiftStart == null ? '' : minutesToInput(cur.shiftStart));
      setShiftEnd(cur.shiftEnd == null ? '' : minutesToInput(cur.shiftEnd));
      setGrace(String(cur.grace));
      setHours(cur.dayMinutes == null ? '' : String(cur.dayMinutes / 60));
    });
  }, [params.staff, today]);

  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/staff/${params.staff ?? ''}`);

  const save = async () => {
    if (!me || !params.staff) return;
    setBusy(true);
    setError(null);
    const r = await savePay(supabase, {
      ...me,
      staffId: params.staff,
      effectiveFrom: from,
      payType,
      amount,
      overtime,
      shiftStart,
      shiftEnd,
      grace,
      hoursPerDay: payType === 'hourly' ? hours : '',
    });
    setBusy(false);
    if (r.ok) back();
    else setError(payError(r));
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('mobile.staff.back')}
          onPress={back}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']} numberOfLines={1} style={{ flex: 1 }}>
          {params.name || t('mobile.staff.back')}
        </Text>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space['space-4'],
            paddingTop: space['space-1'],
            gap: space['space-5'],
          }}
        >
          <View style={{ gap: space['space-1'] }}>
            <Text variant="title-xl">{t(`${f}.title`)}</Text>
            <Text muted>{t(`${f}.hint`)}</Text>
          </View>
          <Field
            label={t(`${f}.effectiveFrom`)}
            value={from}
            onChange={setFrom}
            placeholder="DD/MM/YYYY"
            keyboardType="numbers-and-punctuation"
            hint={t('mobile.staff.dateHint')}
          />
          <View style={{ gap: space['space-2'] }}>
            <Text variant="caption" muted>
              {t(`${f}.payType`)}
            </Text>
            <Segmented
              label={t(`${f}.payType`)}
              value={payType}
              onChange={setPayType}
              options={PAY_TYPES.map((p) => ({ value: p, label: t(`staffDetail.pay.types.${p}`) }))}
            />
          </View>
          <AmountField
            label={t(`staffDetail.pay.amount.${payType}`)}
            value={amount}
            onChange={setAmount}
          />
          <Field
            label={t(`${f}.overtime`)}
            value={overtime}
            onChange={setOvertime}
            keyboardType="decimal-pad"
          />
          <View style={{ flexDirection: 'row', gap: space['space-3'] }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t(`${f}.shiftStart`)}
                value={shiftStart}
                onChange={setShiftStart}
                placeholder="09:30"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={t(`${f}.shiftEnd`)}
                value={shiftEnd}
                onChange={setShiftEnd}
                placeholder="20:30"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <Text variant="caption" muted style={{ marginTop: -space['space-3'] }}>
            {t('mobile.staff.shiftHint')}
          </Text>
          <Field
            label={t(`${f}.grace`)}
            value={grace}
            onChange={setGrace}
            keyboardType="number-pad"
          />
          {payType === 'hourly' && (
            <Field
              label={t(`${f}.hoursPerDay`)}
              value={hours}
              onChange={setHours}
              keyboardType="decimal-pad"
            />
          )}
        </ScrollView>
        <BottomBar>
          {error && <FormMessage ok={false} text={error} />}
          <Button
            label={busy ? t(`${f}.saving`) : t(`${f}.save`)}
            icon={Check}
            busy={busy}
            block
            onPress={() => void save()}
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
