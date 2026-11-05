import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronLeft, FileText } from 'lucide-react-native';
import {
  businessDateOf,
  formatDisplayDate,
  formatINR,
  formatTimeOfDay,
  monthOf,
} from '@fincrew/core';
import {
  loadAttendanceMonth,
  loadMoneyNow,
  loadStaffOverview,
  type GridCell,
  type StaffOverview,
  type WeOwe,
} from '@fincrew/data';
import type { StatusKey } from '@fincrew/ui';
import { AttendanceSection } from '@/components/staff/attendance';
import { DocumentsSection } from '@/components/staff/documents';
import { LedgerSection } from '@/components/staff/ledger';
import { OverviewSection } from '@/components/staff/overview';
import { PaySection } from '@/components/staff/pay';
import { Avatar, IconButton, Segmented, StatusPill, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, size, space, useTheme } from '@/lib/theme';

type Tab = 'overview' | 'attendance' | 'ledger' | 'pay' | 'documents';

/**
 * Staff detail (design: "Staff detail"): header with today's status and what the shop owes them,
 * View statement with Historical in its drop-down, then Overview · Attendance · Ledger · Pay ·
 * Docs, each shown with the permission the website uses (yourself always).
 */
export default function StaffDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useSession();
  const { c } = useTheme();
  const [info, setInfo] = useState<StaffOverview | null | undefined>(undefined);
  const [todayCell, setTodayCell] = useState<GridCell | null>(null);
  const [now, setNow] = useState<WeOwe | null>(null);
  const [statements, setStatements] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const self = me?.personId === id;
  const canMoney = self || can('salary.view');
  const canPay = self || can('staff.pay.view');

  const load = useCallback(async () => {
    if (!me || !id) return;
    const today = businessDateOf(new Date());
    const { year, month } = monthOf(today);
    const [person, monthData, money] = await Promise.all([
      loadStaffOverview(supabase, me.shopId, id, canMoney),
      loadAttendanceMonth(supabase, me.shopId, year, month, today),
      canMoney ? loadMoneyNow(supabase, me.shopId, id, today) : null,
    ]);
    setInfo(person);
    setNow(money);
    setTodayCell(
      monthData.rows.find((r) => r.staffId === id)?.cells.find((x) => x.date === today) ?? null,
    );
  }, [me, id, canMoney]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: Tab[] = [
    'overview',
    'attendance',
    ...(canMoney ? (['ledger'] as const) : []),
    ...(canPay ? (['pay'] as const) : []),
    'documents',
  ];
  const showToday =
    todayCell && todayCell.status !== 'future' && todayCell.status !== 'not_employed';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{ paddingHorizontal: space['space-2'], flexDirection: 'row', alignItems: 'center' }}
      >
        <IconButton
          label={t('mobile.staff.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/staff'))}
          icon={<ChevronLeft size={24} color={c['accent-ink']} />}
        />
        <Text variant="label-sm" color={c['accent-ink']}>
          {t('mobile.staff.back')}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: space['space-4'],
          paddingTop: space['space-2'],
          gap: space['space-4'],
        }}
      >
        {info === null && <Text muted>{t('mobile.staff.notFound')}</Text>}
        {info && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'] }}>
              <Avatar name={info.name} size={56} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text variant="title-lg" numberOfLines={2}>
                  {info.name}
                </Text>
                <Text muted>
                  {t('mobile.staff.joined', { date: formatDisplayDate(info.joiningDate) })}
                  {info.leavingDate
                    ? ` · ${t('staffDetail.left', { date: formatDisplayDate(info.leavingDate) })}`
                    : ''}
                </Text>
                {now && (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 10,
                      paddingVertical: 2,
                      borderRadius: radius['radius-pill'],
                      backgroundColor:
                        now.total > 0
                          ? c['status-late-soft']
                          : now.total < 0
                            ? c['status-paid-leave-soft']
                            : c['surface-muted'],
                    }}
                  >
                    <Text
                      variant="caption"
                      color={
                        now.total > 0
                          ? c['money-owed']
                          : now.total < 0
                            ? c['money-advance']
                            : c['ink-muted']
                      }
                    >
                      {now.total > 0
                        ? t('statement.tagOwe', { amount: formatINR(now.total) })
                        : now.total < 0
                          ? t('statement.tagOwes', { amount: formatINR(-now.total) })
                          : t('statement.tagSettled')}
                    </Text>
                  </View>
                )}
                {showToday && (
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
                  >
                    <StatusPill status={todayCell.status as StatusKey} />
                    {todayCell.late && (
                      <Text variant="micro" color={c['status-late']}>
                        {t('mobile.today.lateMin', { minutes: todayCell.lateMinutes ?? 0 })}
                      </Text>
                    )}
                    {todayCell.checkIn !== undefined && (
                      <Text variant="caption" muted>
                        {t('mobile.today.checkIn', { time: formatTimeOfDay(todayCell.checkIn) })}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>

            {canMoney && (
              <View style={{ gap: space['space-1'] }}>
                <View
                  style={{
                    flexDirection: 'row',
                    borderWidth: 1,
                    borderColor: c['line-strong'],
                    borderRadius: radius['radius-md'],
                    overflow: 'hidden',
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/statement/${info.id}`)}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: size['tap-min'],
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: space['space-2'],
                      backgroundColor: pressed ? c['surface-pressed'] : c.surface,
                    })}
                  >
                    <FileText size={20} color={c.ink} />
                    <Text variant="label-sm">{t('statement.view')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('statement.more')}
                    accessibilityState={{ expanded: statements }}
                    onPress={() => setStatements(!statements)}
                    style={({ pressed }) => ({
                      width: size['tap-min'],
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderLeftWidth: 1,
                      borderLeftColor: c['line-strong'],
                      backgroundColor: pressed ? c['surface-pressed'] : c.surface,
                    })}
                  >
                    <ChevronDown size={20} color={c.ink} />
                  </Pressable>
                </View>
                {statements && (
                  <Pressable
                    accessibilityRole="menuitem"
                    onPress={() => {
                      setStatements(false);
                      router.push(`/statement/${info.id}?view=historical`);
                    }}
                    style={({ pressed }) => ({
                      minHeight: 56,
                      justifyContent: 'center',
                      paddingHorizontal: space['space-3'],
                      borderWidth: 1,
                      borderColor: c.line,
                      borderRadius: radius['radius-md'],
                      backgroundColor: pressed ? c['surface-pressed'] : c.surface,
                    })}
                  >
                    <Text variant="label-sm">{t('statement.historical')}</Text>
                    <Text variant="caption" muted>
                      {t('statement.historicalHint', {
                        date: formatDisplayDate(info.joiningDate),
                      })}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            <Segmented
              label={t('staffDetail.tabs.label')}
              value={tab}
              onChange={setTab}
              options={tabs.map((x) => ({
                value: x,
                // "Documents" doesn't fit five tabs on a phone.
                label: x === 'documents' ? t('mobile.staff.docsTab') : t(`staffDetail.tabs.${x}`),
              }))}
            />

            {tab === 'overview' && <OverviewSection info={info} now={now} onChanged={load} />}
            {tab === 'attendance' && (
              <AttendanceSection staffId={info.id} name={info.name} onChanged={load} />
            )}
            {tab === 'ledger' && <LedgerSection staffId={info.id} />}
            {tab === 'documents' && <DocumentsSection staffId={info.id} name={info.name} />}
            {tab === 'pay' && (
              <PaySection
                staffId={info.id}
                name={info.name}
                advanceLimit={info.advanceLimit}
                advanceCut={info.advanceCut}
                advanceMode={info.advanceMode}
                expensePayback={info.expensePayback}
                expenseRecover={info.expenseRecover}
                onChanged={() => void load()}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
