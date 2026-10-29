import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowUpRight, Check, ChevronLeft, Umbrella } from 'lucide-react-native';
import {
  businessDateOf,
  formatDisplayDate,
  formatINR,
  formatTimeOfDay,
  minutesOfDayIST,
  weekday,
} from '@fincrew/core';
import {
  dateOfInstant,
  decideRequest,
  loadRequestContext,
  loadRequests,
  requestDays,
  type DecideResult,
  type RequestContext,
  type RequestItem,
} from '@fincrew/data';
import { Field, FormMessage } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { Avatar, Button, Card, IconButton, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Show = 'pending' | 'decided';
const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const time = (iso: string) => formatTimeOfDay(minutesOfDayIST(new Date(iso)));

function what(r: RequestItem) {
  if (r.kind === 'advance') return formatINR(r.amount ?? 0);
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const d = (x: string) => `${days[weekday(x)]} ${formatDisplayDate(x)}`;
  return t('requests.days', {
    from: d(r.from!),
    to: d(r.to!),
    count: requestDays(r.from!, r.to!).length,
  });
}

function contextText(c: RequestContext | undefined) {
  if (!c) return '';
  if (c.kind === 'leave')
    return c.paidLeft === null
      ? t('requests.leaveFits')
      : t('requests.leaveShort', { count: c.paidLeft });
  return [
    t('requests.owes', { amount: formatINR(c.outstanding) }),
    c.limit != null ? t('requests.limit', { amount: formatINR(c.limit) }) : t('requests.noLimit'),
    c.mode === 'all'
      ? t('requests.cutAll')
      : c.mode === 'fixed'
        ? t('requests.cut', { amount: formatINR(c.cut ?? 0) })
        : t('requests.cutAtRun'),
  ].join(' · ');
}

function decideError(r: Exclude<DecideResult, { ok: true }>, name: string): string {
  const e = 'requests.errors';
  switch (r.reason) {
    case 'no_permission':
      return t(`${e}.noPermission`);
    case 'not_pending':
      return t(`${e}.notPending`);
    case 'leave':
      return t(`${e}.leave`, { name: r.name, left: r.left });
    case 'past':
      return t(`${e}.past`);
    case 'over_limit':
      return t('requests.overLimit', { name });
    case 'failed':
      return t(`${e}.failed`, { reason: r.message });
    default:
      return t(`${e}.failed`, { reason: r.reason });
  }
}

/**
 * Requests (design: "Requests"): leave and advances staff asked for in Staffora. Approve (leave:
 * mark the days paid / unpaid; advance: give it today, confirming past the limit) or reject,
 * through `decideRequest` in `@fincrew/data` like the website. Needs requests.decide.
 */
export default function RequestsScreen() {
  const { me, can } = useSession();
  const { c } = useTheme();
  const [show, setShow] = useState<Show>('pending');
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [context, setContext] = useState<Map<string, RequestContext>>(new Map());
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<{
    item: RequestItem;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [leaveStatus, setLeaveStatus] = useState<'paid_leave' | 'unpaid_leave'>('paid_leave');
  const [mode, setMode] = useState<string>('cash');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const pending = await loadRequests(supabase, me.shopId, 'pending');
    setPendingCount(pending.length);
    if (show === 'pending') {
      setItems(pending);
      setContext(await loadRequestContext(supabase, me.shopId, pending));
    } else setItems(await loadRequests(supabase, me.shopId, 'decided'));
    setLoading(false);
  }, [me, show]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = (item: RequestItem, decision: 'approve' | 'reject') => {
    const ctx = context.get(item.id);
    setLeaveStatus(ctx?.kind === 'leave' && ctx.paidLeft !== null ? 'unpaid_leave' : 'paid_leave');
    setMode('cash');
    setNote('');
    setConfirm(false);
    setError(null);
    setPicked({ item, decision });
  };

  const decide = async () => {
    if (!me || !picked) return;
    setBusy(true);
    setError(null);
    const r = await decideRequest(supabase, {
      shopId: me.shopId,
      permissions: me.permissions,
      today: businessDateOf(new Date()),
      request: picked.item,
      decision: picked.decision,
      leaveStatus,
      mode,
      note,
      confirmOverLimit: confirm,
    });
    setBusy(false);
    if (r.ok) {
      setDone(
        t(picked.decision === 'approve' ? 'requests.done.approved' : 'requests.done.rejected'),
      );
      setPicked(null);
      await load();
    } else {
      if (r.reason === 'over_limit') setConfirm(true);
      setError(decideError(r, picked.item.name));
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;

  if (!can('requests.decide'))
    return (
      <SafeAreaView style={{ flex: 1, padding: space['space-4'], backgroundColor: c.canvas }}>
        <Text>{t('requests.errors.noPermission')}</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('mobile.tabs.today')}
          onPress={back}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t('mobile.tabs.today')}
        </Text>
      </View>
      <View
        style={{
          paddingHorizontal: space['space-4'],
          gap: space['space-2'],
          paddingBottom: space['space-2'],
        }}
      >
        <Text variant="title-xl">{t('requests.title')}</Text>
        <Segmented
          label={t('requests.tabs.label')}
          value={show}
          onChange={(v) => {
            setDone(null);
            setShow(v);
          }}
          options={[
            { value: 'pending', label: t('requests.tabs.pending', { count: pendingCount }) },
            { value: 'decided', label: t('requests.tabs.decided') },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-2'],
          gap: space['space-3'],
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {done && <FormMessage ok text={done} />}
        {items && items.length === 0 && <Text muted>{t(`requests.empty.${show}`)}</Text>}
        {(items ?? []).map((r) => {
          const leave = r.kind === 'leave';
          const KindIcon = leave ? Umbrella : ArrowUpRight;
          return (
            <Card key={r.id} style={{ padding: space['space-4'], gap: space['space-3'] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'] }}>
                <Avatar name={r.name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label" numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text variant="caption" muted>
                    {t('requests.asked', {
                      date: formatDisplayDate(dateOfInstant(r.createdAt)),
                      time: time(r.createdAt),
                    })}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: radius['radius-pill'],
                    backgroundColor: leave ? c['status-paid-leave-soft'] : c['surface-muted'],
                  }}
                >
                  <KindIcon size={14} color={leave ? c['status-paid-leave'] : c['money-advance']} />
                  <Text
                    variant="caption"
                    color={leave ? c['status-paid-leave'] : c['money-advance']}
                  >
                    {t(`requests.kind.${r.kind}`)}
                  </Text>
                </View>
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="title-md">{what(r)}</Text>
                {r.note ? <Text>{`“${r.note}”`}</Text> : null}
                {r.status === 'pending' && context.get(r.id) && (
                  <Text variant="caption" muted>
                    {contextText(context.get(r.id))}
                  </Text>
                )}
              </View>
              {r.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('requests.reject')}
                      variant="secondary"
                      block
                      onPress={() => open(r, 'reject')}
                    />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Button
                      label={t('requests.approve')}
                      icon={Check}
                      block
                      onPress={() => open(r, 'approve')}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ gap: 2 }}>
                  <Text
                    variant="label-sm"
                    color={
                      r.status === 'approved'
                        ? c['money-paid']
                        : r.status === 'rejected'
                          ? c.danger
                          : c['ink-muted']
                    }
                  >
                    {t(`requests.decided.${r.status}`, {
                      name: r.decidedBy ?? r.name,
                      date: r.decidedAt ? formatDisplayDate(dateOfInstant(r.decidedAt)) : '',
                    })}
                  </Text>
                  {r.leaveStatus && (
                    <Text variant="caption" muted>
                      {t('requests.approvedAs', {
                        status: t(`requests.leaveStatus.${r.leaveStatus}`),
                      })}
                    </Text>
                  )}
                  {r.decisionNote ? (
                    <Text variant="caption" muted>
                      {`“${r.decisionNote}”`}
                    </Text>
                  ) : null}
                </View>
              )}
            </Card>
          );
        })}
        <Text variant="caption" muted>
          {t('requests.footnote')}
        </Text>
      </ScrollView>

      <Sheet
        open={!!picked}
        onClose={() => setPicked(null)}
        title={picked ? `${t(`requests.${picked.decision}`)} · ${picked.item.name}` : ''}
        subtitle={picked ? what(picked.item) : undefined}
      >
        {picked?.decision === 'approve' && picked.item.kind === 'leave' && (
          <View style={{ gap: space['space-2'] }}>
            <Text variant="label-sm">{t('requests.markAs')}</Text>
            <Segmented
              label={t('requests.markAs')}
              value={leaveStatus}
              onChange={setLeaveStatus}
              options={(['paid_leave', 'unpaid_leave'] as const).map((v) => ({
                value: v,
                label: t(`requests.leaveStatus.${v}`),
              }))}
            />
            <Text variant="caption" muted>
              {contextText(context.get(picked.item.id))}
            </Text>
          </View>
        )}
        {picked?.decision === 'approve' && picked.item.kind === 'advance' && (
          <View style={{ gap: space['space-2'] }}>
            <Text variant="label-sm">{t('requests.paidWith')}</Text>
            <Segmented
              label={t('requests.paidWith')}
              value={mode}
              onChange={setMode}
              options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
            />
          </View>
        )}
        <Field label={t('requests.reply')} value={note} onChange={setNote} />
        {error && <FormMessage ok={false} text={error} />}
        <View style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-2'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={() => setPicked(null)}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label={
                busy
                  ? t('requests.working')
                  : picked?.decision === 'reject'
                    ? t('requests.reject')
                    : confirm
                      ? t('requests.approveAnyway')
                      : t('requests.approve')
              }
              icon={picked?.decision === 'approve' ? Check : undefined}
              busy={busy}
              block
              onPress={decide}
            />
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
