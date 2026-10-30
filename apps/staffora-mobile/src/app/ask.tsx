import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronLeft, X } from 'lucide-react-native';
import { addDays, businessDateOf, formatDisplayDate, formatINR, parseRupees } from '@fincrew/core';
import {
  askRequest,
  cancelRequest,
  dateOfInstant,
  loadRequests,
  loadStaffOverview,
  requestDays,
  type RequestItem,
} from '@fincrew/data';
import { AmountField, BottomBar, DayStepper, Field, FormMessage } from '@/components/form';
import { Button, Card, IconButton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

const QUICK = [100000, 200000, 500000];
/** How far ahead leave can be asked for, and the longest stretch (the database allows 62 days). */
const AHEAD_DAYS = 365;
const MAX_DAYS = 62;

/**
 * Ask for leave or an advance (design: "Ask for leave / advance, my requests", PLAN §6.3): dates
 * or an amount, a note, Send to the shop (`askRequest`); below, my requests with their state, and
 * Cancel while one is still waiting (`cancelRequest`). The shop decides in FinCrew.
 */
export default function Ask() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: 'leave' | 'advance' = params.kind === 'advance' ? 'advance' : 'leave';
  const { profile } = useAuth();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine, setMine] = useState<RequestItem[]>([]);
  const [owes, setOwes] = useState<number | null>(null);
  const a = 'staffora.ask';

  const load = useCallback(async () => {
    if (!profile) return;
    const [p, d, o] = await Promise.all([
      loadRequests(supabase, profile.shopId, 'pending'),
      loadRequests(supabase, profile.shopId, 'decided'),
      loadStaffOverview(supabase, profile.shopId, profile.personId, true),
    ]);
    setMine([...p, ...d].filter((r) => r.staffId === profile.personId));
    setOwes(o?.advance ?? null);
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeFrom = (d: string) => {
    setFrom(d);
    if (to < d) setTo(d);
    if (requestDays(d, to).length > MAX_DAYS) setTo(addDays(d, MAX_DAYS - 1));
  };

  const send = async () => {
    if (!profile) return;
    setMessage(null);
    let paise = 0;
    if (kind === 'advance') {
      paise = parseRupees(amount.trim()) ?? 0;
      if (!paise) return setMessage({ ok: false, text: t(`${a}.amountBad`) });
    }
    setBusy(true);
    const r =
      kind === 'leave'
        ? await askRequest(supabase, {
            shopId: profile.shopId,
            staffId: profile.personId,
            kind,
            from,
            to,
            note,
          })
        : await askRequest(supabase, {
            shopId: profile.shopId,
            staffId: profile.personId,
            kind,
            amount: paise,
            note,
          });
    setBusy(false);
    if (!r.ok) return setMessage({ ok: false, text: t(`${a}.failed`, { reason: r.message }) });
    setMessage({ ok: true, text: t(`${a}.sent`) });
    setNote('');
    setAmount('');
    await load();
  };

  const cancel = async (id: string) => {
    setMessage(null);
    if (await cancelRequest(supabase, id)) {
      setMessage({ ok: true, text: t(`${a}.cancelled`) });
      await load();
    } else setMessage({ ok: false, text: t(`${a}.failed`, { reason: '—' }) });
  };

  const what = (r: RequestItem) =>
    r.kind === 'advance'
      ? t(`${a}.itemAdvance`, { amount: formatINR(r.amount ?? 0) })
      : t(`${a}.itemLeave`, {
          dates:
            r.from === r.to
              ? formatDisplayDate(r.from!)
              : `${formatDisplayDate(r.from!)} – ${formatDisplayDate(r.to!)}`,
        });
  const pill = (s: RequestItem['status']) =>
    s === 'approved'
      ? { bg: c['status-present-soft'], fg: c['money-paid'] }
      : s === 'pending'
        ? { bg: c['status-late-soft'], fg: c.ink }
        : s === 'rejected'
          ? { bg: c['status-absent-soft'], fg: c['status-absent'] }
          : { bg: c['surface-muted'], fg: c['ink-muted'] };
  const days = requestDays(from, to).length;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t(`${a}.back`)}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t(`${a}.back`)}
        </Text>
      </View>
      {/* The form and Send move up above the keyboard (Android edge-to-edge). */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space['space-4'],
            paddingTop: 0,
            gap: space['space-4'],
          }}
        >
          <Text variant="title-lg">
            {t(kind === 'leave' ? `${a}.leaveTitle` : `${a}.advanceTitle`)}
          </Text>

          {kind === 'leave' ? (
            <Card style={{ padding: space['space-4'], gap: space['space-2'] }}>
              <Text variant="caption" muted>
                {t(`${a}.from`)}
              </Text>
              <DayStepper
                label={t(`${a}.from`)}
                value={from}
                onChange={changeFrom}
                min={today}
                max={addDays(today, AHEAD_DAYS)}
              />
              <Text variant="caption" muted>
                {t(`${a}.to`)}
              </Text>
              <DayStepper
                label={t(`${a}.to`)}
                value={to}
                onChange={setTo}
                min={from}
                max={addDays(from, MAX_DAYS - 1)}
              />
              <Text muted>{t(`${a}.days`, { count: days })}</Text>
              <Text variant="caption" muted>
                {t(`${a}.shopDecides`)}
              </Text>
            </Card>
          ) : (
            <Card style={{ padding: space['space-4'] }}>
              <AmountField
                label={t(`${a}.howMuch`)}
                value={amount}
                onChange={setAmount}
                quick={QUICK}
                hint={owes ? t(`${a}.owesNow`, { amount: formatINR(owes) }) : t(`${a}.cutHint`)}
              />
            </Card>
          )}

          <Field
            label={t(`${a}.why`)}
            value={note}
            onChange={setNote}
            placeholder={t(kind === 'leave' ? `${a}.whyLeave` : `${a}.whyAdvance`)}
          />
          {message && <FormMessage ok={message.ok} text={message.text} />}

          <View style={{ gap: space['space-2'] }}>
            <Text variant="title-md">{t(`${a}.mine`)}</Text>
            {mine.length === 0 ? (
              <Text muted>{t(`${a}.none`)}</Text>
            ) : (
              <Card>
                {mine.map((r, i) => {
                  const p = pill(r.status);
                  return (
                    <View
                      key={r.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space['space-3'],
                        minHeight: 64,
                        paddingHorizontal: space['space-4'],
                        paddingVertical: space['space-2'],
                        borderBottomWidth: i < mine.length - 1 ? 1 : 0,
                        borderBottomColor: c.line,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label-sm">{what(r)}</Text>
                        <Text variant="caption" muted numberOfLines={2}>
                          {[
                            t(`${a}.asked`, {
                              date: formatDisplayDate(dateOfInstant(r.createdAt)),
                            }),
                            r.decisionNote ? `“${r.decisionNote}”` : r.note,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 2,
                            borderRadius: radius['radius-pill'],
                            backgroundColor: p.bg,
                          }}
                        >
                          <Text variant="caption" color={p.fg}>
                            {t(`${a}.state.${r.status}`)}
                          </Text>
                        </View>
                        {r.status === 'pending' && (
                          <Button
                            label={t(`${a}.cancel`)}
                            variant="quiet"
                            icon={X}
                            onPress={() => void cancel(r.id)}
                          />
                        )}
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}
          </View>
        </ScrollView>
        <BottomBar>
          <Button
            label={busy ? t(`${a}.sending`) : t(`${a}.send`)}
            icon={Check}
            busy={busy}
            block
            onPress={send}
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
