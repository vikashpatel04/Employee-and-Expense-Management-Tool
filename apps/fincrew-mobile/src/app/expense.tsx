import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Camera, Check, ChevronLeft, ImageIcon, LayoutGrid, Trash2 } from 'lucide-react-native';
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
  saveExpense,
  type ChargedToKind,
  type ExpenseWriteResult,
  type PaidByKind,
} from '@fincrew/data';
import { AmountField, BottomBar, DayStepper, Field, FormMessage } from '@/components/form';
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

/**
 * Add or edit an expense (design: "Add expense"): amount first, day, category grid, who paid,
 * who it's charged to, bill photo, how it was paid, note. Saving goes through `saveExpense`
 * (`@fincrew/data`), the same rules as the website; without edit permission it is read-only.
 */
export default function ExpenseScreen() {
  const params = useLocalSearchParams<{ id?: string; month?: string }>();
  const id = params.id || null;
  const { me, can } = useSession();
  const { c } = useTheme();
  const today = businessDateOf(new Date());
  const asked = parseYm(params.month);
  const startDate = asked ? monthEnd(asked.year, asked.month) : today;

  const [data, setData] = useState<FormData | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(startDate < today ? startDate : today);
  const [categoryId, setCategoryId] = useState('');
  const [allCats, setAllCats] = useState(false);
  const [paidBy, setPaidBy] = useState<PaidByKind>('owner');
  const [paidStaff, setPaidStaff] = useState('');
  const [reimburse, setReimburse] = useState(true);
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
      setReimburse(e.reimburse);
      setCharged(e.charged_to_kind as ChargedToKind);
      setChargedTouched(true);
      setChargedStaff(e.charged_to_staff_id ?? '');
      setMode(e.payment_mode);
      setNote(e.note ?? '');
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
        reimburse,
        note,
      },
      bill: photo,
      removeBill,
      newId: randomUUID,
    });
    setBusy(false);
    if (r.ok) back();
    else setError(expenseError(r));
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

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-1'],
          gap: space['space-6'],
        }}
      >
        <Text variant="title-xl">{title}</Text>
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
            <Card style={{ padding: space['space-4'], gap: space['space-3'] }}>
              <AmountField
                label={t(`${f}.amount`)}
                value={amount}
                onChange={changeAmount}
                quick={QUICK}
              />
              <Text variant="caption" muted>
                {t(`${f}.date`)}
              </Text>
              <DayStepper value={date} onChange={setDate} max={today} />
            </Card>

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

            <View style={{ gap: space['space-2'] }}>
              {sectionTitle(t(`${f}.paidBy`))}
              <Segmented
                label={t(`${f}.paidBy`)}
                value={paidBy}
                onChange={setPaidBy}
                options={(['owner', 'shop_cash', 'staff'] as const).map((v) => ({
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
                  <Checkbox label={t(`${f}.reimburse`)} value={reimburse} onChange={setReimburse} />
                </>
              )}
            </View>

            <View style={{ gap: space['space-2'] }}>
              {sectionTitle(t(`${f}.chargedTo`))}
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
                {!chargedTouched && !id && autoCharged === 'not_tracked' && data.smallLimit != null
                  ? t(`${f}.smallHint`, { limit: formatINR(data.smallLimit) })
                  : t(`${f}.chargedHint.${charged}`, {
                      month: monthLabel(Number(date.slice(0, 4)), Number(date.slice(5, 7))),
                    })}
              </Text>
            </View>

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

            <View style={{ gap: space['space-2'] }}>
              {sectionTitle(t(`${f}.paidWith`))}
              <Segmented
                label={t(`${f}.paidWith`)}
                value={mode}
                onChange={setMode}
                options={MODES.map((m) => ({ value: m, label: modes[m] ?? m }))}
              />
            </View>

            <Field
              label={t(`${f}.note`)}
              value={note}
              onChange={setNote}
              placeholder={t(`${f}.notePlaceholder`)}
            />

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
          <Button
            label={busy ? t(`${f}.saving`) : t(`${f}.save`)}
            icon={Check}
            busy={busy && !confirmDelete}
            block
            onPress={save}
          />
        </BottomBar>
      )}

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

function Checkbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'], minHeight: 48 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: value ? c.accent : c['line-strong'],
          backgroundColor: value ? c.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value && <Check size={16} color={c['on-accent']} strokeWidth={3} />}
      </View>
      <Text style={{ flex: 1 }}>{label}</Text>
    </Pressable>
  );
}
