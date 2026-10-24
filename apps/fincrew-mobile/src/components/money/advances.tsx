import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { IndianRupee } from 'lucide-react-native';
import { formatINR } from '@fincrew/core';
import { loadAdvanceBalances, loadStaffList, type AdvanceBalance } from '@fincrew/data';
import { AdvanceSheet, type AdvancePerson } from '@/components/advance-sheet';
import { BottomBar, FormMessage } from '@/components/form';
import { Avatar, Button, Card, SectionTitle, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

/**
 * Money · Advances (design: "Money · advances, give"): who still owes advances and how they're
 * recovered (`loadAdvanceBalances`, like the website). Tap a person, or "Give advance", to give
 * one or record cash paid back.
 */
export function AdvancesSection() {
  const { me, can } = useSession();
  const { c } = useTheme();
  const [data, setData] = useState<{ rows: AdvanceBalance[]; total: number } | null>(null);
  const [everyone, setEveryone] = useState<AdvancePerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<{ person: AdvancePerson | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canGive = can('advances.give');

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const [balances, staff] = await Promise.all([
      loadAdvanceBalances(supabase, me.shopId),
      loadStaffList(supabase, me.shopId),
    ]);
    setData(balances);
    const owed = new Map(balances.all.map((r) => [r.staffId, r]));
    setEveryone(
      staff
        .filter((s) => s.status === 'active')
        .map((s) => ({
          staffId: s.id,
          name: s.name,
          outstanding: owed.get(s.id)?.outstanding ?? 0,
          limit: owed.get(s.id)?.limit ?? null,
        })),
    );
    setLoading(false);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const a = 'mobile.money.advances';
  const meta = (r: AdvanceBalance) =>
    [
      r.cut != null ? t(`${a}.cutMonthly`, { amount: formatINR(r.cut) }) : t(`${a}.cutAtRun`),
      r.limit != null ? t(`${a}.limit`, { amount: formatINR(r.limit) }) : t(`${a}.noLimit`),
    ].join(' · ');

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-2'],
          gap: space['space-4'],
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {data && (
          <>
            <Card style={{ padding: space['space-5'], gap: 4 }}>
              <Text variant="label-sm" muted>
                {t(`${a}.total`, { count: data.rows.length })}
              </Text>
              <Text variant="money-hero" color={c['money-advance']}>
                {formatINR(data.total)}
              </Text>
            </Card>
            {message && <FormMessage ok text={message} />}
            {data.rows.length === 0 ? (
              <Text muted>{t('advances.empty')}</Text>
            ) : (
              <View style={{ gap: space['space-2'] }}>
                <SectionTitle title={t(`${a}.whoOwes`)} count={data.rows.length} />
                <Card>
                  {data.rows.map((r) => (
                    <Pressable
                      key={r.staffId}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.name}, ${formatINR(r.outstanding)}`}
                      onPress={() =>
                        canGive
                          ? setSheet({
                              person: {
                                staffId: r.staffId,
                                name: r.name,
                                outstanding: r.outstanding,
                                limit: r.limit,
                              },
                            })
                          : router.push({ pathname: '/staff/[id]', params: { id: r.staffId } })
                      }
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space['space-3'],
                        minHeight: 72,
                        paddingHorizontal: space['space-4'],
                        paddingVertical: space['space-2'],
                        borderBottomWidth: 1,
                        borderBottomColor: c.line,
                        backgroundColor: pressed ? c['surface-muted'] : 'transparent',
                      })}
                    >
                      <Avatar name={r.name} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text variant="caption" muted numberOfLines={2}>
                          {meta(r)}
                        </Text>
                      </View>
                      <Text variant="money-md" color={c['money-advance']}>
                        {formatINR(r.outstanding)}
                      </Text>
                    </Pressable>
                  ))}
                </Card>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {canGive && data && (
        <BottomBar>
          <Button
            label={t('advances.give')}
            icon={IndianRupee}
            block
            onPress={() => setSheet({ person: null })}
          />
        </BottomBar>
      )}

      <AdvanceSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        person={sheet?.person ?? null}
        people={everyone}
        onSaved={(m) => {
          setMessage(m);
          void load();
        }}
      />
    </>
  );
}
