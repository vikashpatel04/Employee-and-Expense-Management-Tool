import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Hourglass, Undo2 } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatINR } from '@fincrew/core';
import { loadLedger, undoLedgerLine, type LedgerEntry } from '@fincrew/data';
import { FormMessage } from '@/components/form';
import { Sheet } from '@/components/sheet';
import { Button, Card, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

/** Lines that can be undone (PLAN §4.7): a salary payment or an advance given. */
const UNDOABLE = ['salary_payment', 'advance'];

/**
 * Staff detail · Ledger (design: Staff detail · Ledger): balance, then every line by month,
 * newest first, with the running balance after it (core `runningBalances` via `loadLedger`).
 * With salary.undo_payment, a payment or advance has **Undo**: it asks first, then adds the exact
 * reversal dated today (`undoLedgerLine`, once per line — the website does the same).
 */
export function LedgerSection({ staffId }: { staffId: string }) {
  const { c } = useTheme();
  const { me, can } = useSession();
  const [lines, setLines] = useState<LedgerEntry[] | null>(null);
  const [undo, setUndo] = useState<LedgerEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const canUndo = can('salary.undo_payment');

  const load = useCallback(() => loadLedger(supabase, staffId).then(setLines), [staffId]);
  useEffect(() => {
    void load();
  }, [load]);

  const confirmUndo = async () => {
    if (!me || !undo) return;
    setBusy(true);
    const r = await undoLedgerLine(supabase, {
      ...me,
      staffId,
      lineId: undo.id,
      today: businessDateOf(new Date()),
    });
    setBusy(false);
    setUndo(null);
    setMessage(
      r.ok
        ? { ok: true, text: t('advances.done.undone') }
        : {
            ok: false,
            text:
              r.reason === 'no_permission'
                ? t('advances.errors.noPermission')
                : t('advances.errors.failed', { reason: r.message }),
          },
    );
    if (r.ok) await load();
  };

  if (!lines) return null;
  if (lines.length === 0) return <Text muted>{t('staffDetail.ledger.empty')}</Text>;

  const months = t('months.long', { returnObjects: true }) as unknown as string[];
  const newest = [...lines].reverse();
  const byMonth = new Map<string, LedgerEntry[]>();
  for (const l of newest)
    byMonth.set(l.date.slice(0, 7), [...(byMonth.get(l.date.slice(0, 7)) ?? []), l]);
  const balance = newest[0]!.balance;
  const tone = balance > 0 ? c['money-owed'] : balance < 0 ? c['money-advance'] : c['ink-muted'];

  return (
    <View style={{ gap: space['space-4'] }}>
      {message && <FormMessage ok={message.ok} text={message.text} />}
      <Card
        style={{
          padding: space['space-4'],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 2 }}>
          <Text variant="caption" muted>
            {t('staffDetail.ledger.balance')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Hourglass size={16} color={tone} />
            <Text variant="label-sm" color={tone}>
              {balance > 0
                ? t('mobile.staff.balanceDue')
                : balance < 0
                  ? t('mobile.staff.balanceOwes')
                  : t('staffDetail.balance.settled')}
            </Text>
          </View>
        </View>
        <Text variant="money-lg">{formatINR(Math.abs(balance))}</Text>
      </Card>

      {[...byMonth.entries()].map(([ym, rows]) => (
        <View key={ym} style={{ gap: space['space-2'] }}>
          <Text variant="title-md">{`${months[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`}</Text>
          <Card>
            {rows.map((l) => (
              <View
                key={l.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space['space-3'],
                  paddingHorizontal: space['space-4'],
                  paddingVertical: space['space-3'],
                  borderBottomWidth: 1,
                  borderBottomColor: c.line,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label-sm">
                    {t(`ledgerTypes.${l.type}`)}
                    {l.name ? ` · ${l.name}` : ''}
                    {l.adjusts ? ` · ${t(`ledgerTypes.${l.adjusts}`)}` : ''}
                  </Text>
                  <Text variant="caption" muted>
                    {formatDisplayDate(l.date)}
                    {l.mode ? ` · ${l.mode.toUpperCase()}` : ''}
                    {l.note ? ` · ${l.note}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="money-sm" color={l.amount > 0 ? c['money-owed'] : c.ink}>
                    {l.amount > 0 ? '+' : ''}
                    {formatINR(l.amount)}
                  </Text>
                  <Text variant="caption" muted>
                    {t('staffDetail.ledger.runningBalance', { amount: formatINR(l.balance) })}
                  </Text>
                  {l.undone ? (
                    <Text variant="caption" muted>
                      {t('advances.undone')}
                    </Text>
                  ) : (
                    canUndo &&
                    UNDOABLE.includes(l.type) && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t('advances.undo')} · ${t(`ledgerTypes.${l.type}`)} ${formatINR(l.amount)}`}
                        onPress={() => {
                          setMessage(null);
                          setUndo(l);
                        }}
                        hitSlop={8}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          minHeight: 32,
                          paddingTop: 4,
                        }}
                      >
                        <Undo2 size={14} color={c['accent-ink']} />
                        <Text variant="caption" color={c['accent-ink']}>
                          {t('advances.undo')}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Sheet
        open={!!undo}
        onClose={() => setUndo(null)}
        title={t('mobile.staff.undoTitle')}
        subtitle={
          undo
            ? `${t(`ledgerTypes.${undo.type}`)} · ${formatDisplayDate(undo.date)} · ${formatINR(undo.amount)}`
            : undefined
        }
      >
        {undo && (
          <Text muted>
            {t('mobile.staff.undoBody', {
              amount: `${-undo.amount > 0 ? '+' : ''}${formatINR(-undo.amount)}`,
            })}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: space['space-2'], marginTop: space['space-4'] }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('mobile.today.sheet.cancel')}
              variant="secondary"
              block
              onPress={() => setUndo(null)}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label={t('mobile.staff.undoConfirm')}
              icon={Undo2}
              busy={busy}
              block
              onPress={() => void confirmUndo()}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}
