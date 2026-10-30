import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  LayoutGrid,
  Receipt,
  Trash2,
} from 'lucide-react-native';
import {
  businessDateOf,
  defaultChargedTo,
  formatDisplayDate,
  formatINR,
  monthEnd,
  parseRupees,
  weekday,
} from '@fincrew/core';
import {
  billUrl,
  deleteExpense,
  loadExpenseForm,
  loadExpenseOwed,
  payBackExpenses,
  saveExpense,
  type ChargedToKind,
  type ExpenseWriteResult,
  type PaidByKind,
} from '@fincrew/data';
import { AmountField, BottomBar, DayStepper, Field, FormMessage } from '@/components/form';
import { PayBackSheet } from '@/components/payback-sheet';
import { Sheet } from '@/components/sheet';
import { Button, Card, IconButton, Segmented, Text } from '@/components/ui';
import { pickBillPhoto, type BillPhoto } from '@/lib/bill-photo';
import { t } from '@/lib/i18n';
import { categoryColour, categoryIcon, monthLabel, parseYm } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type FormData = Awaited<ReturnType<typeof loadExpenseForm>>;
const f = 'expenses.form';
const MODES = ['cash', 'upi', 'bank', 'card'] as const;
const QUICK = [10000, 50000, 100000];
/** Categories shown before "All N" (design: 7 + All). */
const FIRST = 7;

/** A refused save → the same message the website shows. */
function expenseError(r: Exclude<ExpenseWriteResult, { ok: true }>): string {
  switch (r.reason) {
    case 'no_permission':
      return t('settings.errors.noPermission');
    case 'amount':
      return t(`${f}.errors.amount`);
    case 'date':
      return t('common.invalidDate');
    case 'category':
      return t(`${f}.errors.category`);
    case 'staff_paid':
      return t(`${f}.errors.staffPaid`);
    case 'staff_charged':
      return t(`${f}.errors.staffCharged`);
    case 'bill':
      return t(`${f}.billBad`);
    case 'invalid':
      return t(`${f}.errors.failed`, { reason: r.problems.join('; ') });
    case 'failed':
      return t(`${f}.errors.failed`, { reason: r.message });
  }
}

type GiveBack = 'salary' | 'now' | 'none';

/**
 * Add or edit an expense. Adding goes in three steps (owner, 29/10/2026; design "Add expense ·
 * in steps"): 1 amount and category (Save now keeps today and shop cash), 2 who paid, give it
 * back (with salary / now / not needed), whose expense, paid with, date, 3 bill photo and note
 * with a summary. Editing shows every part at once. Saving goes through `saveExpense`
 * (`@fincrew/data`), the same rules as the website; "now" also pays it back
 * (`payBackExpenses`, salary.run). Without edit permission it is read-only.
 */
export default function ExpenseScreen() {
  const params = useLocalSearchParams<{ id?: string; month?: string; date?: string }>();
  const id = params.id || null;
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const asked = parseYm(params.month);
  // Starts on the day being viewed (Day view), else the month's last day, else today.
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '')
    ? params.date!
    : asked
      ? monthEnd(asked.year, asked.month)
      : today;

  const [data, setData] = useState<FormData | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(startDate < today ? startDate : today);
  const [categoryId, setCategoryId] = useState('');
  const [allCats, setAllCats] = useState(false);
  const [paidBy, setPaidBy] = useState<PaidByKind>('shop_cash');
  const [paidStaff, setPaidStaff] = useState('');
  const [giveBack, setGiveBack] = useState<GiveBack>('salary');
  const [step, setStep] = useState(1);
  // Saved, but paying it back failed: the message, and the screen only offers Done.
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [charged, setCharged] = useState<ChargedToKind>('shop');
  const [chargedTouched, setChargedTouched] = useState(false);
  const [chargedStaff, setChargedStaff] = useState('');
  const [mode, setMode] = useState<string>('cash');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<BillPhoto | null>(null);
  const [savedBill, setSavedBill] = useState<string | null>(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [picking, setPicking] = useState<'paid' | 'charged' | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Paid by staff and owed to them: what the shop still owes them, to pay back now (salary.run).
  const [owed, setOwed] = useState(0);
  const [payBackOpen, setPayBackOpen] = useState(false);
  const [paidBack, setPaidBack] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    void loadExpenseForm(supabase, me.shopId, id).then(async (d) => {
      setData(d);
      const e = d.expense;
      if (!e) return;
      setAmount(String(Number(e.amount_paise) / 100));
      setDate(e.date);
      setCategoryId(e.category_id);
      setPaidBy(e.paid_by_kind as PaidByKind);
      setPaidStaff(e.paid_by_staff_id ?? '');
      setGiveBack(e.reimburse ? 'salary' : 'none');
      setCharged(e.charged_to_kind as ChargedToKind);
      setChargedTouched(true);
      setChargedStaff(e.charged_to_staff_id ?? '');
      setMode(e.payment_mode);
      setNote(e.note ?? '');
      if (e.paid_by_kind === 'staff' && e.reimburse && e.paid_by_staff_id && can('salary.run'))
        setOwed(await loadExpenseOwed(supabase, e.paid_by_staff_id));
      if (e.bill_path) setSavedBill(await billUrl(supabase, e.bill_path));
    });
  }, [me, id]);

  const editable = id ? can('expenses.edit') : can('expenses.add');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/money'));
  const names = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));
  const people = (data?.staff ?? []).filter(
    (s) => s.active || s.id === paidStaff || s.id === chargedStaff,
  );
  const cats = (data?.categories ?? []).filter((x) => !x.archived || x.id === categoryId);
  const shownCats = allCats || cats.length <= FIRST + 1 ? cats : cats.slice(0, FIRST);
  const modes = t('salary.modes', { returnObjects: true }) as unknown as Record<string, string>;
  const days = t('weekdays.short', { returnObjects: true }) as unknown as string[];
  const autoCharged =
    data?.smallLimit != null && parseRupees(amount)
      ? defaultChargedTo(parseRupees(amount)!, data.smallLimit)
      : null;

  const changeAmount = (v: string) => {
    setAmount(v);
    if (chargedTouched || id || data?.smallLimit == null) return;
    const p = parseRupees(v);
    if (p) setCharged(defaultChargedTo(p, data.smallLimit));
  };

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const p = await pickBillPhoto(source);
      if (p) {
        setPhoto(p);
        setRemoveBill(false);
      }
    } catch {
      setError(t(`${f}.billBad`));
    }
  };

  const adding = !id;
  const shows = (n: number) => !adding || step === n;
  const goNext = () => {
    setError(null);
    if (step === 1 && !parseRupees(amount)) return setError(t(`${f}.errors.amount`));
    if (step === 1 && !categoryId) return setError(t(`${f}.errors.category`));
    if (step === 2 && paidBy === 'staff' && !paidStaff) return setError(t(`${f}.errors.staffPaid`));
    if (step === 2 && charged === 'staff' && !chargedStaff)
      return setError(t(`${f}.errors.staffCharged`));
    setStep(step + 1);
  };
  const giveBackOptions: GiveBack[] =
    adding && can('salary.run') ? ['salary', 'now', 'none'] : ['salary', 'none'];
  const summary = [
    paidBy === 'staff'
      ? t(`${f}.summaryPaid.staff`, { name: names.get(paidStaff) ?? '' })
      : t(`${f}.summaryPaid.${paidBy}`),
    modes[mode],
    paidBy === 'staff' ? t(`${f}.summaryBack.${giveBack}`) : null,
    t(`${f}.summaryCharged.${charged}`, { name: names.get(chargedStaff) ?? '' }),
    formatDisplayDate(date),
  ]
    .filter(Boolean)
    .join(' · ');

  const save = async () => {
    if (!me) return;
    setBusy(true);
    setError(null);
    const r = await saveExpense(supabase, {
      shopId: me.shopId,
      permissions: me.permissions,
      expenseId: id,
      form: {
        amount,
        date: formatDisplayDate(date),
        categoryId,
        mode,
        paidBy,
        paidByStaffId: paidStaff,
        chargedTo: charged,
        chargedToStaffId: chargedStaff,
        reimburse: giveBack !== 'none',
        note,
      },
      bill: photo,
      removeBill,
      newId: randomUUID,
    });
    if (!r.ok) {
      setBusy(false);
      return setError(expenseError(r));
    }
    if (adding && paidBy === 'staff' && giveBack === 'now') {
      const p = await payBackExpenses(supabase, {
        ...me,
        staffId: paidStaff,
        amount,
        date: formatDisplayDate(date),
        mode,
        note,
      });
      if (!p.ok) {
        setBusy(false);
        return setSavedNote(t(`${f}.paidBackFailed`));
      }
    }
    setBusy(false);
    back();
  };

  const remove = async () => {
    if (!me || !id) return;
    setBusy(true);
    const r = await deleteExpense(supabase, { ...me, expenseId: id });
    setBusy(false);
    if (r.ok) back();
    else
      setError(
        r.reason === 'no_permission'
          ? t('settings.errors.noPermission')
          : t(`${f}.errors.failed`, { reason: r.message }),
      );
  };

  const title = !id ? t(`${f}.addTitle`) : editable ? t(`${f}.editTitle`) : t(`${f}.viewTitle`);
  const billShown = photo?.uri ?? (removeBill ? null : savedBill);
  const sectionTitle = (s: string) => (
    <Text variant="title-md" style={{ paddingHorizontal: space['space-1'] }}>
      {s}
    </Text>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t(`${f}.close`)}
          onPress={back}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']} style={{ flex: 1 }}>
          {t('mobile.tabs.money')}
        </Text>
        {me && (
          <Text
            variant="caption"
            muted
            numberOfLines={1}
            style={{ paddingRight: space['space-2'] }}
          >
            {me.shopName}
          </Text>
        )}
      </View>

      {/* The form and its buttons move up above the keyboard (Android edge-to-edge). */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space['space-4'],
            paddingTop: space['space-1'],
            gap: space['space-6'],
          }}
        >
          {adding && editable ? (
            <View style={{ gap: space['space-2'] }}>
              <Text variant="label-sm" muted>
                {t(`${f}.steps.stepOf`, { n: step })}
              </Text>
              <Text variant="title-xl">
                {t(`${f}.steps.${(['howMuch', 'whoPaidTitle', 'billTitle'] as const)[step - 1]}`)}
              </Text>
              <View accessibilityElementsHidden style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3].map((n) => (
                  <View
                    key={n}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: radius['radius-pill'],
                      backgroundColor: n <= step ? c.accent : c['line-strong'],
                    }}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Text variant="title-xl">{title}</Text>
          )}
          {paidBack && <FormMessage ok text={paidBack} />}
          {data?.expense && owed > 0 && (
            <Card style={{ padding: space['space-4'], gap: space['space-3'] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="label-sm">{t('payBack.owed')}</Text>
                <Text variant="money-md">{formatINR(owed)}</Text>
              </View>
              <Button
                label={t('payBack.button')}
                variant="secondary"
                icon={Receipt}
                block
                onPress={() => setPayBackOpen(true)}
              />
            </Card>
          )}
          {id && data && !data.expense && <Text muted>{t('mobile.money.expenses.notFound')}</Text>}

          {data && (!id || data.expense) && !editable && data.expense && (
            <Card style={{ padding: space['space-4'], gap: space['space-2'] }}>
              <Text variant="money-lg">{formatINR(Number(data.expense.amount_paise))}</Text>
              <Text>{`${days[weekday(data.expense.date)]} ${formatDisplayDate(data.expense.date)}`}</Text>
              <Text muted>
                {[
                  data.categories.find((x) => x.id === data.expense!.category_id)?.name,
                  modes[data.expense.payment_mode],
                  data.expense.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>
          )}

          {data && editable && (!id || data.expense) && (
            <>
              {shows(1) && (
                <Card style={{ padding: space['space-4'], gap: space['space-3'] }}>
                  <AmountField
                    label={t(`${f}.amount`)}
                    value={amount}
                    onChange={changeAmount}
                    quick={QUICK}
                  />
                  {!adding && (
                    <>
                      <Text variant="caption" muted>
                        {t(`${f}.date`)}
                      </Text>
                      <DayStepper value={date} onChange={setDate} max={today} />
                    </>
                  )}
                </Card>
              )}

              {shows(1) && (
                <View style={{ gap: space['space-2'] }}>
                  {sectionTitle(t(`${f}.category`))}
                  <View
                    accessibilityRole="radiogroup"
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] }}
                  >
                    {shownCats.map((cat) => {
                      const on = cat.id === categoryId;
                      const Icon = categoryIcon(cat.icon);
                      const col = categoryColour(cat.colour);
                      return (
                        <Pressable
                          key={cat.id}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={cat.name}
                          onPress={() => setCategoryId(cat.id)}
                          style={{
                            width: '23%',
                            flexGrow: 1,
                            minHeight: 80,
                            padding: space['space-2'],
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            borderRadius: radius['radius-md'],
                            backgroundColor: on ? c['accent-soft'] : c.surface,
                            borderWidth: on ? 2 : 1,
                            borderColor: on ? c.accent : c.line,
                          }}
                        >
                          <Icon size={24} color={on ? c['accent-ink'] : c[col.fg]} />
                          <Text
                            variant="micro"
                            color={on ? c['accent-ink'] : c.ink}
                            numberOfLines={2}
                            style={{ textAlign: 'center' }}
                          >
                            {cat.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {shownCats.length < cats.length && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setAllCats(true)}
                        style={{
                          width: '23%',
                          flexGrow: 1,
                          minHeight: 80,
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          borderRadius: radius['radius-md'],
                          borderWidth: 1,
                          borderColor: c.line,
                          backgroundColor: c.surface,
                        }}
                      >
                        <LayoutGrid size={24} color={c['accent-ink']} />
                        <Text variant="micro" color={c['accent-ink']}>
                          {t('mobile.money.expenses.allCategories', { count: cats.length })}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
              {adding && step === 1 && (
                <Card style={{ padding: space['space-3'], backgroundColor: c['surface-muted'] }}>
                  <Text variant="caption">
                    {t(`${f}.steps.defaults`, { date: formatDisplayDate(date) })}
                  </Text>
                </Card>
              )}

              {shows(2) && (
                <View style={{ gap: space['space-2'] }}>
                  {sectionTitle(t(`${f}.paidBy`))}
                  <Segmented
                    label={t(`${f}.paidBy`)}
                    value={paidBy}
                    onChange={setPaidBy}
                    // The shop pays or a staff member does (owner, 29/10/2026); "Owner" stays only on
                    // old expenses that used it.
                    options={(data.expense?.paid_by_kind === 'owner'
                      ? (['owner', 'shop_cash', 'staff'] as const)
                      : (['shop_cash', 'staff'] as const)
                    ).map((v) => ({
                      value: v,
                      label: t(`${f}.paidByOptions.${v}`),
                    }))}
                  />
                  {paidBy === 'staff' && (
                    <>
                      <PersonButton
                        label={t(`${f}.whoPaid`)}
                        name={names.get(paidStaff)}
                        onPress={() => setPicking('paid')}
                      />
                      <Text variant="caption" muted>
                        {t(`${f}.giveBack`)}
                      </Text>
                      <Segmented<GiveBack>
                        label={t(`${f}.giveBack`)}
                        value={giveBack}
                        onChange={setGiveBack}
                        options={giveBackOptions.map((v) => ({
                          value: v,
                          label: t(`${f}.giveBackOptions.${v}`),
                        }))}
                      />
                      {giveBack === 'now' && (
                        <Text variant="caption" muted>
                          {t(`${f}.giveBackNowHint`, { name: names.get(paidStaff) ?? '—' })}
                        </Text>
                      )}
                    </>
                  )}
                </View>
              )}

              {shows(2) && (
                <View style={{ gap: space['space-2'] }}>
                  {sectionTitle(adding ? t(`${f}.whose`) : t(`${f}.chargedTo`))}
                  <Segmented
                    label={t(`${f}.chargedTo`)}
                    value={charged}
                    onChange={(v) => {
                      setCharged(v);
                      setChargedTouched(true);
                    }}
                    options={(['shop', 'staff', 'not_tracked'] as const).map((v) => ({
                      value: v,
                      label: t(`${f}.chargedOptions.${v}`),
                    }))}
                  />
                  {charged === 'staff' && (
                    <PersonButton
                      label={t(`${f}.staffMember`)}
                      name={names.get(chargedStaff)}
                      onPress={() => setPicking('charged')}
                    />
                  )}
                  <Text variant="caption" muted style={{ paddingHorizontal: space['space-1'] }}>
                    {!chargedTouched &&
                    !id &&
                    autoCharged === 'not_tracked' &&
                    data.smallLimit != null
                      ? t(`${f}.smallHint`, { limit: formatINR(data.smallLimit) })
                      : t(`${f}.chargedHint.${charged}`, {
                          month: monthLabel(Number(date.slice(0, 4)), Number(date.slice(5, 7))),
                        })}
                  </Text>
                </View>
              )}

              {shows(3) && (
                <View style={{ gap: space['space-2'] }}>
                  {sectionTitle(t(`${f}.bill`))}
                  {billShown ? (
                    <Card style={{ padding: space['space-2'], gap: space['space-2'] }}>
                      <Image
                        source={{ uri: billShown }}
                        accessibilityLabel={t('expenses.hasBill')}
                        resizeMode="contain"
                        style={{ width: '100%', height: 220, borderRadius: radius['radius-sm'] }}
                      />
                      <Button
                        label={t(`${f}.billRemove`)}
                        variant="quiet"
                        icon={Trash2}
                        onPress={() => {
                          setPhoto(null);
                          setRemoveBill(!!savedBill);
                        }}
                      />
                    </Card>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
                      {Platform.OS !== 'web' && (
                        <View style={{ flex: 1 }}>
                          <Button
                            label={t('mobile.money.expenses.takePhoto')}
                            variant="secondary"
                            icon={Camera}
                            block
                            onPress={() => pick('camera')}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Button
                          label={t('mobile.money.expenses.pickPhoto')}
                          variant="secondary"
                          icon={ImageIcon}
                          block
                          onPress={() => pick('library')}
                        />
                      </View>
                    </View>
                  )}
                  <Text variant="caption" muted style={{ paddingHorizontal: space['space-1'] }}>
                    {t(`${f}.billHint`)}
                  </Text>
                </View>
              )}

              {shows(2) && (
                <View style={{ gap: space['space-2'] }}>
                  {sectionTitle(t(`${f}.paidWith`))}
                  <Segmented
                    label={t(`${f}.paidWith`)}
                    value={mode}
                    onChange={setMode}
                    options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
                  />
                </View>
              )}
              {adding && step === 2 && (
                <View style={{ gap: space['space-2'] }}>
                  {sectionTitle(t(`${f}.date`))}
                  <DayStepper value={date} onChange={setDate} max={today} />
                </View>
              )}

              {shows(3) && (
                <Field
                  label={t(`${f}.note`)}
                  value={note}
                  onChange={setNote}
                  placeholder={t(`${f}.notePlaceholder`)}
                />
              )}
              {adding && step === 3 && (
                <Card style={{ padding: space['space-4'], gap: 2 }}>
                  <Text variant="caption" muted>
                    {t(`${f}.steps.summary`)}
                  </Text>
                  <Text variant="title-md">
                    {`${parseRupees(amount) ? formatINR(parseRupees(amount)!) : '—'} · ${
                      cats.find((x) => x.id === categoryId)?.name ?? '—'
                    }`}
                  </Text>
                  <Text variant="caption" muted>
                    {summary}
                  </Text>
                </Card>
              )}

              {id && can('expenses.edit') && (
                <View style={{ gap: space['space-2'] }}>
                  <Button
                    label={confirmDelete ? t(`${f}.deleteConfirm`) : t(`${f}.delete`)}
                    variant={confirmDelete ? 'secondary' : 'quiet'}
                    icon={Trash2}
                    busy={busy && confirmDelete}
                    onPress={() => (confirmDelete ? remove() : setConfirmDelete(true))}
                  />
                  {confirmDelete && (
                    <Text variant="caption" muted>
                      {t(`${f}.deleteHint`)}
                    </Text>
                  )}
                </View>
              )}
            </>
          )}

          {!editable && billShown && (
            <Image
              source={{ uri: billShown }}
              accessibilityLabel={t('expenses.hasBill')}
              resizeMode="contain"
              style={{ width: '100%', height: 320, borderRadius: radius['radius-md'] }}
            />
          )}
        </ScrollView>

        {data && editable && (!id || data.expense) && (
          <BottomBar>
            {error && <FormMessage ok={false} text={error} />}
            {savedNote ? (
              <>
                <FormMessage ok={false} text={savedNote} />
                <Button label={t(`${f}.close`)} icon={Check} block onPress={back} />
              </>
            ) : adding ? (
              <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
                {step > 1 && (
                  <Button
                    label={t(`${f}.steps.back`)}
                    variant="quiet"
                    onPress={() => {
                      setError(null);
                      setStep(step - 1);
                    }}
                  />
                )}
                {step < 3 && (
                  <View style={{ flex: 1 }}>
                    <Button
                      label={busy ? t(`${f}.saving`) : t(`${f}.steps.saveNow`)}
                      variant="secondary"
                      busy={busy}
                      block
                      onPress={save}
                    />
                  </View>
                )}
                <View style={{ flex: 1.3 }}>
                  {step < 3 ? (
                    <Button
                      label={t(`${f}.steps.next`)}
                      icon={ChevronRight}
                      block
                      disabled={busy}
                      onPress={goNext}
                    />
                  ) : (
                    <Button
                      label={busy ? t(`${f}.saving`) : t(`${f}.save`)}
                      icon={Check}
                      busy={busy}
                      block
                      onPress={save}
                    />
                  )}
                </View>
              </View>
            ) : (
              <Button
                label={busy ? t(`${f}.saving`) : t(`${f}.save`)}
                icon={Check}
                busy={busy && !confirmDelete}
                block
                onPress={save}
              />
            )}
          </BottomBar>
        )}
      </KeyboardAvoidingView>

      <Sheet
        open={!!picking}
        onClose={() => setPicking(null)}
        title={picking === 'paid' ? t(`${f}.whoPaid`) : t(`${f}.staffMember`)}
      >
        {people.map((p) => {
          const on = (picking === 'paid' ? paidStaff : chargedStaff) === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                if (picking === 'paid') setPaidStaff(p.id);
                else setChargedStaff(p.id);
                setPicking(null);
              }}
              style={{
                minHeight: 56,
                paddingHorizontal: space['space-4'],
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: radius['radius-md'],
                backgroundColor: on ? c['accent-soft'] : c['surface-muted'],
              }}
            >
              <Text variant="label">{p.name}</Text>
              {on && <Check size={20} color={c['accent-ink']} />}
            </Pressable>
          );
        })}
      </Sheet>

      {data?.expense?.paid_by_staff_id && (
        <PayBackSheet
          open={payBackOpen}
          onClose={() => setPayBackOpen(false)}
          staffId={data.expense.paid_by_staff_id}
          name={data.staff.find((p) => p.id === data.expense!.paid_by_staff_id)?.name ?? ''}
          owed={owed}
          amount={Math.min(owed, Number(data.expense.amount_paise))}
          onSaved={(text) => {
            setPaidBack(text);
            void loadExpenseOwed(supabase, data.expense!.paid_by_staff_id!).then(setOwed);
          }}
        />
      )}
    </SafeAreaView>
  );
}

/** Opens the person picker; shows who is chosen. */
function PersonButton({
  label,
  name,
  onPress,
}: {
  label: string;
  name?: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${name ?? t(`${f}.chooseStaff`)}`}
        onPress={onPress}
        style={{
          minHeight: 48,
          paddingHorizontal: space['space-3'],
          justifyContent: 'center',
          borderRadius: radius['radius-sm'],
          backgroundColor: c['surface-muted'],
        }}
      >
        <Text muted={!name}>{name ?? t(`${f}.chooseStaff`)}</Text>
      </Pressable>
    </View>
  );
}
