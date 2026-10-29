import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  Clock,
  Hourglass,
  IndianRupee,
  MessageCircle,
  RefreshCw,
} from 'lucide-react-native';
import {
  businessDateOf,
  formatINR,
  monthOf,
  paiseToInput,
  parseRupees,
  phoneKey,
  type PayslipLine,
} from '@fincrew/core';
import {
  finalizeSalary,
  loadSalaryRun,
  PAYSLIP_MINUS_LINES,
  paySalary,
  runSalary,
  SALARY_GROUPS,
  salaryOverview,
  type SalaryPerson,
  type SalaryWriteResult,
} from '@fincrew/data';
import { AmountField, BottomBar, Checkbox, FormMessage, MonthStepper } from '@/components/form';
import { useStatePill } from '@/components/money/salary';
import { Sheet } from '@/components/sheet';
import { Avatar, Button, Card, IconButton, Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { monthLabel, parseYm, ym } from '@/lib/money';
import { useSession } from '@/lib/session';
import { sharePayslip } from '@/lib/share-payslip';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Run = Awaited<ReturnType<typeof loadSalaryRun>>;
type Confirm = { kind: 'finalize' } | { kind: 'pay'; person: SalaryPerson | null };
const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const MINUS = PAYSLIP_MINUS_LINES;

/**
 * Salary run (redesign, owner 29/10/2026; design "Salary · in steps"): the month as steps
 * (Attendance → Work out → Finalize → Pay), the big amount with what to do next, and people
 * grouped by what they need (needs a look / ready / still to pay / paid); tap a name for the
 * working. Work out a month with the shared rules, finalize the ready ones (or everyone), then
 * pay everyone or one person. Every step
 * goes through `@fincrew/data` (runSalary / finalizeSalary / paySalary), like the website;
 * finalizing and paying write permanent ledger lines, so each asks first. Paying one person can
 * be part of what's due, and can send them the payslip on WhatsApp; "Share payslips" sends each
 * finalized payslip (`sharePayslip`, same text as Staffora).
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
  const [amount, setAmount] = useState('');
  const [sendWa, setSendWa] = useState(true);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);

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
      return true;
    } else {
      setMessage({
        ok: false,
        text:
          r.reason === 'no_permission'
            ? t('salary.errors.noPermission')
            : t('salary.errors.failed', { reason: r.message }),
      });
      return false;
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
      () =>
        finalizeSalary(supabase, {
          ...me,
          runId: run.runId!,
          payslipIds: look > 0 ? groups.ready.map((p) => p.id) : undefined,
        }),
      (r) => t('salary.done.finalized', { count: r.count }),
    );
  const askPay = (person: SalaryPerson | null) => {
    setAmount(person ? paiseToInput(due(person)) : '');
    setSendWa(true);
    setSheetError(null);
    setConfirm({ kind: 'pay', person });
  };
  const pay = async (person: SalaryPerson | null) => {
    if (!me || !run?.runId) return;
    let part: number | null = null;
    if (person) {
      const left = due(person);
      const typed = parseRupees(amount);
      if (typed === null || typed <= 0 || typed > left)
        return setSheetError(t(`${s}.amountTooMuch`, { amount: formatINR(left) }));
      if (typed < left) part = typed;
    }
    const ok = await act(
      () =>
        paySalary(supabase, {
          ...me,
          runId: run.runId!,
          payslipId: person?.id ?? null,
          mode,
          today,
          amount: part,
        }),
      (r) => t('salary.done.paid', { count: r.count }),
    );
    if (ok && person && sendWa) await send(person);
  };
  const send = async (person: SalaryPerson) => {
    setSharing(person.id);
    const ok = await sharePayslip(person.id, person.phone);
    setSharing(null);
    if (!ok) setMessage({ ok: false, text: t(`${s}.shareFailed`) });
  };

  const people = run?.people ?? [];
  const sum = (f: (p: SalaryPerson) => number) => people.reduce((a, p) => a + f(p), 0);
  const due = (p: SalaryPerson) => Math.max(0, p.net - p.paidAmount);
  const final = people.filter((p) => p.state !== 'draft');
  const overall = run?.overall ?? 'none';
  const { groups, totals, unmarked, dueCount } = salaryOverview(people);
  const look = groups.look.length;
  const ready = groups.ready.length;
  const drafts = look + ready;
  const stage = people.length === 0 ? 'none' : drafts > 0 ? 'draft' : dueCount > 0 ? 'pay' : 'paid';
  const st = 'salary.steps';
  type Kind = 'done' | 'warn' | 'current' | 'todo';
  const steps: { key: string; kind: Kind }[] = [
    { key: 'attendance', kind: unmarked > 0 ? 'warn' : people.length ? 'done' : 'todo' },
    { key: 'workOut', kind: people.length ? 'done' : 'current' },
    { key: 'finalize', kind: drafts > 0 ? 'current' : people.length ? 'done' : 'todo' },
    { key: 'pay', kind: stage === 'paid' ? 'done' : stage === 'pay' ? 'current' : 'todo' },
  ];
  const dot = (k: Kind) =>
    k === 'done'
      ? { bg: c['status-present-soft'], fg: c['status-present'] }
      : k === 'warn'
        ? { bg: c['status-late-soft'], fg: c['status-late'] }
        : k === 'current'
          ? { bg: c.accent, fg: c['on-accent'] }
          : { bg: c['surface-muted'], fg: c['ink-muted'] };
  const nextText =
    stage === 'none'
      ? t(`${st}.next.noneBody`)
      : stage === 'draft'
        ? look > 0
          ? t(`${st}.next.lookBody`, { count: look, ready })
          : t(`${st}.next.readyBody`)
        : stage === 'pay'
          ? t(`${st}.next.payBody`, { amount: formatINR(totals.due), count: dueCount })
          : t(`${st}.next.paidBody`);
  const groupDot = {
    look: c['status-late'],
    ready: c.accent,
    due: c['money-owed'],
    paid: c['money-paid'],
  } as const;
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

        {run && (
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={t(`${st}.label`)}>
            {steps.map((x, n) => {
              const d = dot(x.kind);
              return (
                <View key={x.key} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: d.bg,
                    }}
                  >
                    {x.kind === 'done' ? (
                      <Check size={16} color={d.fg} />
                    ) : x.kind === 'warn' ? (
                      <Clock size={16} color={d.fg} />
                    ) : (
                      <Text variant="label-sm" color={d.fg}>
                        {String(n + 1)}
                      </Text>
                    )}
                  </View>
                  <Text
                    variant="caption"
                    color={x.kind === 'current' ? c.ink : c['ink-muted']}
                    style={{ textAlign: 'center' }}
                    numberOfLines={2}
                  >
                    {t(`${st}.${x.key}`)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {run && (
          <Card style={{ padding: space['space-5'], gap: 4 }}>
            {people.length > 0 && (
              <>
                <Text variant="label-sm" muted>
                  {stage === 'pay'
                    ? t(`mobile.money.salary.stillToPay`, { count: dueCount })
                    : stage === 'paid'
                      ? t(`${st}.hero.paid`, { month: mName })
                      : t(`mobile.money.salary.netPay`, { count: people.length })}
                </Text>
                <Text variant="money-hero">
                  {formatINR(stage === 'pay' ? totals.due : totals.net)}
                </Text>
                <View
                  style={{
                    height: 8,
                    marginTop: 4,
                    borderRadius: radius['radius-pill'],
                    backgroundColor: c['surface-muted'],
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: 8,
                      width: `${totals.net > 0 ? Math.round((totals.paid / totals.net) * 100) : 0}%`,
                      backgroundColor: c['money-paid'],
                    }}
                  />
                </View>
                <Text variant="caption" muted>
                  {stage === 'draft'
                    ? t(`${st}.hero.draftSub`, { count: people.length })
                    : stage === 'paid'
                      ? t(`${st}.hero.paidSub`, { count: people.length })
                      : t(`${st}.hero.dueSub`, {
                          paid: formatINR(totals.paid),
                          net: formatINR(totals.net),
                        })}
                </Text>
              </>
            )}
            {people.length === 0 && (
              <Text variant="title-md">{t('salary.empty.title', { month: mName })}</Text>
            )}
            <View
              style={{
                marginTop: space['space-2'],
                padding: space['space-3'],
                borderRadius: radius['radius-md'],
                backgroundColor: c['accent-soft'],
                gap: 2,
              }}
            >
              <Text variant="micro" color={c['accent-ink']}>
                {stage === 'paid' ? t(`${st}.next.doneKicker`) : t(`${st}.next.kicker`)}
              </Text>
              <Text variant="caption">
                {canRun || stage !== 'none' ? nextText : t('salary.empty.noPermission')}
              </Text>
            </View>
          </Card>
        )}

        {SALARY_GROUPS.filter((g) => groups[g].length > 0).map((g) => (
          <View key={g} style={{ gap: space['space-2'] }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space['space-2'],
                paddingHorizontal: space['space-1'],
              }}
            >
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: groupDot[g] }}
              />
              <Text variant="label">{t(`${st}.groups.${g}`)}</Text>
              <Text muted>{String(groups[g].length)}</Text>
            </View>
            <Card>
              {groups[g].map((p) => {
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
                              <Text variant="money-sm" color={minus ? c['money-deduction'] : c.ink}>
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
                        {p.state !== 'draft' && (
                          <View
                            style={{
                              flexDirection: 'row',
                              gap: space['space-2'],
                              marginTop: space['space-2'],
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Button
                                label={t(`${s}.sendOne`)}
                                icon={MessageCircle}
                                variant="secondary"
                                busy={sharing === p.id}
                                block
                                onPress={() => void send(p)}
                              />
                            </View>
                            {canRun && p.state === 'finalized' && left > 0 && (
                              <View style={{ flex: 1.2 }}>
                                <Button
                                  label={t(`${s}.payOne`, { amount: formatINR(left) })}
                                  icon={IndianRupee}
                                  block
                                  onPress={() => askPay(p)}
                                />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          </View>
        ))}
        {people.length > 0 && overall === 'draft' && (
          <Text variant="caption" muted style={{ paddingHorizontal: space['space-1'] }}>
            {t(`${s}.tapHint`)}
          </Text>
        )}
      </ScrollView>

      {run && (canRun || message || final.length > 0) && (
        <BottomBar>
          {message && <FormMessage ok={message.ok} text={message.text} />}
          {canRun && overall === 'draft' && (
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              {t(`${s}.finalizeHint`)}
            </Text>
          )}
          {final.length > 0 && overall !== 'draft' && (
            <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t(`${s}.share`)}
                  icon={MessageCircle}
                  variant="secondary"
                  block
                  onPress={() => setShareOpen(true)}
                />
              </View>
              {canRun && dueCount > 0 && (
                <View style={{ flex: 1.4 }}>
                  <Button
                    label={t(`${s}.payAll`)}
                    icon={IndianRupee}
                    block
                    disabled={busy}
                    onPress={() => askPay(null)}
                  />
                </View>
              )}
            </View>
          )}
          {canRun && overall !== 'finalized' && overall !== 'paid' && (
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
              <View style={{ flex: 1.4 }}>
                {overall === 'none' ? (
                  <Button
                    label={busy ? t('salary.working') : t('salary.run')}
                    icon={Check}
                    busy={busy}
                    block
                    onPress={work}
                  />
                ) : (
                  <Button
                    label={
                      look > 0 ? t(`${st}.finalizeReady`, { count: ready }) : t(`${st}.finalizeAll`)
                    }
                    icon={Check}
                    block
                    disabled={busy || ready === 0}
                    onPress={() => setConfirm({ kind: 'finalize' })}
                  />
                )}
              </View>
            </View>
          )}
          {canRun && (overall === 'finalized' || overall === 'paid') && (
            <Button
              label={t('salary.runAgain')}
              icon={RefreshCw}
              variant="quiet"
              busy={busy && !confirm}
              block
              onPress={work}
            />
          )}
        </BottomBar>
      )}

      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === 'finalize'
            ? look > 0
              ? t(`${st}.confirmReadyTitle`, { count: ready })
              : t(`${s}.confirmFinalize`, { month: mName })
            : confirm?.person
              ? t(`${s}.payTitle`, { name: confirm.person.name })
              : t(`${s}.payAllTitle`, { count: dueCount })
        }
        subtitle={
          confirm?.kind === 'finalize'
            ? look > 0
              ? t(`${st}.confirmReadyBody`)
              : t(`${s}.confirmFinalizeBody`)
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
        {confirm?.kind === 'pay' && confirm.person && (
          <AmountField
            label={t(`${s}.amount`)}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setSheetError(null);
            }}
            hint={t(`${s}.amountHint`)}
          />
        )}
        {confirm?.kind === 'pay' && (
          <View style={{ gap: space['space-2'], marginTop: space['space-2'] }}>
            <Text variant="label-sm">{t('salary.payMode')}</Text>
            <Segmented
              label={t('salary.payMode')}
              value={mode}
              onChange={setMode}
              options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
            />
          </View>
        )}
        {confirm?.kind === 'pay' && confirm.person && (
          <Checkbox
            label={
              phoneKey(confirm.person.phone)
                ? t(`${s}.sendWhatsApp`)
                : t(`${s}.sendWhatsAppNoPhone`)
            }
            value={sendWa}
            onChange={setSendWa}
          />
        )}
        {sheetError && <FormMessage ok={false} text={sheetError} />}
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
                label={
                  look > 0 ? t(`${st}.finalizeReady`, { count: ready }) : t(`${st}.finalizeAll`)
                }
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

      <Sheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={t(`${s}.share`)}
        subtitle={t(`${s}.shareSub`, { month: mName })}
      >
        {final.map((p) => (
          <View
            key={p.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['space-3'],
              minHeight: 64,
              paddingVertical: space['space-2'],
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <Avatar name={p.name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" numberOfLines={1}>
                {p.name}
              </Text>
              <Text variant="caption" muted numberOfLines={1}>
                {phoneKey(p.phone)
                  ? `${formatINR(p.net)} · ${p.phone}`
                  : `${formatINR(p.net)} · ${t(`${s}.noPhone`)}`}
              </Text>
            </View>
            <Button
              label={t(`${s}.sendOne`)}
              icon={MessageCircle}
              variant="secondary"
              busy={sharing === p.id}
              onPress={() => void send(p)}
            />
          </View>
        ))}
      </Sheet>
    </SafeAreaView>
  );
}
