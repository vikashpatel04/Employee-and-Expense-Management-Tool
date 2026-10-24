import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  Hourglass,
  IndianRupee,
  RefreshCw,
} from 'lucide-react-native';
import { businessDateOf, formatINR, monthOf, type PayslipLine } from '@fincrew/core';
import {
  finalizeSalary,
  loadSalaryRun,
  paySalary,
  runSalary,
  type SalaryPerson,
  type SalaryWriteResult,
} from '@fincrew/data';
import { BottomBar, FormMessage, MonthStepper, Notice } from '@/components/form';
import { useStatePill } from '@/components/money/salary';
import { Sheet } from '@/components/sheet';
import { Avatar, Button, Card, IconButton, SectionTitle, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { monthLabel, parseYm, ym } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Run = Awaited<ReturnType<typeof loadSalaryRun>>;
type Confirm = { kind: 'finalize' } | { kind: 'pay'; person: SalaryPerson | null };
const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const MINUS = ['deduction', 'late_deduction', 'advance_cut'];

/**
 * Salary run (design: "Salary run · draft review / finalized, pay one"): work out a month with
 * the shared rules, check each payslip, finalize, then pay everyone or one person. Every step
 * goes through `@fincrew/data` (runSalary / finalizeSalary / paySalary), like the website;
 * finalizing and paying write permanent ledger lines, so each asks first.
 */
export default function SalaryRun() {
  const params = useLocalSearchParams<{ month?: string }>();
  const { me, can } = useSession();
  const { c } = useTheme();
  const pill = useStatePill();
  const today = businessDateOf(new Date());
  const current = monthOf(today);
  const start = parseYm(params.month) ?? current;
  const [{ year, month }, setMonth] = useState(
    ym(start.year, start.month) > ym(current.year, current.month) ? current : start,
  );
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [mode, setMode] = useState<string>('cash');

  const canRun = can('salary.run');
  const mName = monthLabel(year, month);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setRun(await loadSalaryRun(supabase, me.shopId, year, month));
    setLoading(false);
  }, [me, year, month]);

  useEffect(() => {
    setMessage(null);
    setOpen(null);
    void load();
  }, [load]);

  const act = async (
    step: () => Promise<SalaryWriteResult>,
    done: (r: Extract<SalaryWriteResult, { ok: true }>) => string,
  ) => {
    setBusy(true);
    setMessage(null);
    const r = await step();
    setBusy(false);
    setConfirm(null);
    if (r.ok) {
      setMessage({ ok: true, text: done(r) });
      await load();
    } else {
      setMessage({
        ok: false,
        text:
          r.reason === 'no_permission'
            ? t('salary.errors.noPermission')
            : t('salary.errors.failed', { reason: r.message }),
      });
    }
  };

  const work = () =>
    me &&
    act(
      () => runSalary(supabase, { ...me, year, month }),
      (r) => t('salary.done.run', { created: r.created ?? 0, updated: r.updated ?? 0 }),
    );
  const finalize = () =>
    me &&
    run?.runId &&
    act(
      () => finalizeSalary(supabase, { ...me, runId: run.runId! }),
      (r) => t('salary.done.finalized', { count: r.count }),
    );
  const pay = (person: SalaryPerson | null) =>
    me &&
    run?.runId &&
    act(
      () =>
        paySalary(supabase, {
          ...me,
          runId: run.runId!,
          payslipId: person?.id ?? null,
          mode,
          today,
        }),
      (r) => t('salary.done.paid', { count: r.count }),
    );

  const people = run?.people ?? [];
  const sum = (f: (p: SalaryPerson) => number) => people.reduce((a, p) => a + f(p), 0);
  const due = (p: SalaryPerson) => Math.max(0, p.net - p.paidAmount);
  const dueCount = people.filter((p) => due(p) > 0 && p.state !== 'draft').length;
  const overall = run?.overall ?? 'none';
  const warnings = people.flatMap((p) =>
    p.warnings.map((w) => t(`salary.warnings.${w.code}`, { name: p.name, count: w.count ?? 0 })),
  );
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const lineLabel = (l: PayslipLine, p: SalaryPerson) =>
    t(`salary.lines.${l.kind}`, { name: l.name ?? '', days: p.summary.payableDays });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/money'));
  const s = 'mobile.money.salary';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('mobile.tabs.money')}
          onPress={back}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t('mobile.tabs.money')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-1'],
          gap: space['space-4'],
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space['space-2'],
          }}
        >
          <Text variant="title-xl">{t('salary.title')}</Text>
          {run && (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: radius['radius-pill'],
                backgroundColor: pill(overall).bg,
              }}
            >
              <Text variant="caption" color={pill(overall).fg}>
                {t(`salary.status.${overall}`)}
              </Text>
            </View>
          )}
        </View>
        <MonthStepper year={year} month={month} max={current} onChange={setMonth} />

        {run && people.length === 0 && (
          <Card style={{ padding: space['space-5'], gap: space['space-2'] }}>
            <Text variant="title-md">{t('salary.empty.title', { month: mName })}</Text>
            <Text muted>{canRun ? t('salary.empty.body') : t('salary.empty.noPermission')}</Text>
          </Card>
        )}

        {people.length > 0 && (
          <>
            <Card style={{ padding: space['space-5'], gap: 4 }}>
              <Text variant="label-sm" muted>
                {overall === 'finalized'
                  ? t(`${s}.stillToPay`, { count: dueCount })
                  : t(`${s}.netPay`, { count: people.length })}
              </Text>
              <Text variant="money-hero">
                {formatINR(overall === 'finalized' ? sum(due) : sum((p) => p.net))}
              </Text>
              <View
                style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-3'] }}
              >
                {(
                  [
                    ['gross', sum((p) => p.gross), false],
                    ['deductions', sum((p) => p.deductions), true],
                    ['advance', sum((p) => p.cut), true],
                  ] as const
                ).map(([k, v, minus]) => (
                  <View key={k} style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption" muted>
                      {t(`salary.totals.${k}`)}
                    </Text>
                    <Text variant="money-sm" color={minus && v ? c['money-deduction'] : c.ink}>
                      {minus && v ? '−' : ''}
                      {formatINR(v)}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>

            {warnings.length > 0 && overall === 'draft' && (
              <Notice title={t('salary.warnings.title')}>
                {warnings.map((w) => (
                  <Text key={w} variant="caption" muted>
                    {w}
                  </Text>
                ))}
              </Notice>
            )}

            <View style={{ gap: space['space-2'] }}>
              <SectionTitle title={t(`${s}.staff`, { count: people.length })} />
              <Card>
                {people.map((p) => {
                  const isOpen = open === p.id;
                  const left = due(p);
                  const meta = [
                    t(`${s}.payableDays`, { days: p.summary.payableDays }),
                    p.cut ? t(`${s}.cut`, { amount: formatINR(p.cut) }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <View key={p.id} style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        accessibilityLabel={`${p.name}, ${formatINR(p.net)}, ${t(`salary.rowStatus.${p.state}`)}`}
                        onPress={() => setOpen(isOpen ? null : p.id)}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space['space-3'],
                          minHeight: 72,
                          paddingLeft: space['space-4'],
                          paddingRight: space['space-3'],
                          paddingVertical: space['space-2'],
                          backgroundColor: pressed ? c['surface-muted'] : 'transparent',
                        })}
                      >
                        <Avatar name={p.name} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="label" numberOfLines={1}>
                            {p.name}
                          </Text>
                          {p.warnings.length > 0 && p.state === 'draft' ? (
                            <Text variant="caption" color={c['status-late']} numberOfLines={1}>
                              {t(`${s}.short.${p.warnings[0]!.code}`, {
                                count: p.warnings[0]!.count ?? 0,
                              })}
                            </Text>
                          ) : (
                            <Text variant="caption" muted numberOfLines={1}>
                              {meta}
                            </Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text variant="money-md">{formatINR(p.net)}</Text>
                          {p.state === 'paid' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <CircleCheck size={14} color={c['money-paid']} />
                              <Text variant="caption" color={c['money-paid']}>
                                {t('salary.rowStatus.paid')}
                              </Text>
                            </View>
                          )}
                          {p.state === 'finalized' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Hourglass size={14} color={c['money-owed']} />
                              <Text variant="caption" color={c['money-owed']}>
                                {p.paidAmount > 0
                                  ? t('salary.rowStatus.partly', { paid: formatINR(p.paidAmount) })
                                  : t(`${s}.due`)}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                          <ChevronDown size={20} color={c['ink-muted']} />
                        </View>
                      </Pressable>

                      {isOpen && (
                        <View
                          style={{
                            paddingHorizontal: space['space-4'],
                            paddingBottom: space['space-4'],
                            gap: 2,
                          }}
                        >
                          <Text variant="caption" muted style={{ paddingBottom: 4 }}>
                            {t('salary.days.payable', {
                              payable: p.summary.payableDays,
                              employed: p.summary.employedDays,
                            })}
                          </Text>
                          {p.lines.map((l, i) => {
                            const minus = MINUS.includes(l.kind);
                            return (
                              <View
                                key={i}
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'space-between',
                                  gap: space['space-3'],
                                  paddingVertical: 6,
                                }}
                              >
                                <Text style={{ flex: 1 }}>{lineLabel(l, p)}</Text>
                                <Text
                                  variant="money-sm"
                                  color={minus ? c['money-deduction'] : c.ink}
                                >
                                  {minus ? '−' : ''}
                                  {formatINR(l.amount)}
                                </Text>
                              </View>
                            );
                          })}
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              paddingTop: space['space-2'],
                              marginTop: 4,
                              borderTopWidth: 1,
                              borderTopColor: c.line,
                            }}
                          >
                            <Text variant="label-sm">{t('salary.lines.net')}</Text>
                            <Text variant="money-md">{formatINR(p.net)}</Text>
                          </View>
                          {canRun && p.state === 'finalized' && left > 0 && (
                            <View style={{ marginTop: space['space-2'] }}>
                              <Button
                                label={t(`${s}.payOne`, { amount: formatINR(left) })}
                                icon={IndianRupee}
                                variant="secondary"
                                block
                                onPress={() => setConfirm({ kind: 'pay', person: p })}
                              />
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </Card>
              {overall === 'draft' && (
                <Text variant="caption" muted style={{ paddingHorizontal: space['space-1'] }}>
                  {t(`${s}.tapHint`)}
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {run && (canRun || message) && (
        <BottomBar>
          {message && <FormMessage ok={message.ok} text={message.text} />}
          {canRun && overall === 'draft' && (
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              {t(`${s}.finalizeHint`)}
            </Text>
          )}
          {canRun && (
            <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
              {people.length > 0 && (
                <View style={{ flex: 1 }}>
                  <Button
                    label={t('salary.runAgain')}
                    icon={RefreshCw}
                    variant="secondary"
                    busy={busy && !confirm}
                    block
                    onPress={work}
                  />
                </View>
              )}
              {(overall === 'none' ||
                overall === 'draft' ||
                (overall === 'finalized' && dueCount > 0)) && (
                <View style={{ flex: 1.4 }}>
                  {overall === 'none' ? (
                    <Button
                      label={busy ? t('salary.working') : t('salary.run')}
                      icon={Check}
                      busy={busy}
                      block
                      onPress={work}
                    />
                  ) : overall === 'draft' ? (
                    <Button
                      label={t('salary.finalize')}
                      icon={Check}
                      block
                      disabled={busy}
                      onPress={() => setConfirm({ kind: 'finalize' })}
                    />
                  ) : (
                    <Button
                      label={t(`${s}.payAll`)}
                      icon={IndianRupee}
                      block
                      disabled={busy}
                      onPress={() => setConfirm({ kind: 'pay', person: null })}
                    />
                  )}
                </View>
              )}
            </View>
          )}
        </BottomBar>
      )}

      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === 'finalize'
            ? t(`${s}.confirmFinalize`, { month: mName })
            : confirm?.person
              ? t(`${s}.payTitle`, { name: confirm.person.name })
              : t(`${s}.payAllTitle`, { count: dueCount })
        }
        subtitle={
          confirm?.kind === 'finalize'
            ? t(`${s}.confirmFinalizeBody`)
            : t(`${s}.paySub`, {
                month: mName,
                amount: formatINR(
                  confirm?.kind === 'pay' && confirm.person
                    ? due(confirm.person)
                    : sum((p) => (p.state === 'finalized' ? due(p) : 0)),
                ),
              })
        }
      >
        {confirm?.kind === 'pay' && (
          <View style={{ gap: space['space-2'] }}>
            <Text variant="label-sm">{t('salary.payMode')}</Text>
            <Segmented
              label={t('salary.payMode')}
              value={mode}
              onChange={setMode}
              options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
            />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-4'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={() => setConfirm(null)}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            {confirm?.kind === 'finalize' ? (
              <Button
                label={t('salary.finalize')}
                icon={Check}
                busy={busy}
                block
                onPress={finalize}
              />
            ) : (
              <Button
                label={t('salary.pay')}
                icon={IndianRupee}
                busy={busy}
                block
                onPress={() => confirm?.kind === 'pay' && pay(confirm.person)}
              />
            )}
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
