import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Hourglass } from 'lucide-react-native';
import { formatDisplayDate, formatINR } from '@fincrew/core';
import { loadLedger, type LedgerEntry } from '@fincrew/data';
import { Card, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

/**
 * Staff detail · Ledger (design: Staff detail · Ledger): balance, then every line by month,
 * newest first, with the running balance after it (core `runningBalances` via `loadLedger`).
 */
export function LedgerSection({ staffId }: { staffId: string }) {
  const { c } = useTheme();
  const [lines, setLines] = useState<LedgerEntry[] | null>(null);

  useEffect(() => {
    void loadLedger(supabase, staffId).then(setLines);
  }, [staffId]);

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
                  {l.undone && (
                    <Text variant="caption" muted>
                      {t('advances.undone')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}
