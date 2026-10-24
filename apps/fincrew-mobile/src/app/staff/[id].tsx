import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, formatTimeOfDay, monthOf } from '@fincrew/core';
import {
  loadAttendanceMonth,
  loadStaffOverview,
  type GridCell,
  type StaffOverview,
} from '@fincrew/data';
import type { StatusKey } from '@fincrew/ui';
import { AttendanceSection } from '@/components/staff/attendance';
import { LedgerSection } from '@/components/staff/ledger';
import { OverviewSection } from '@/components/staff/overview';
import { PaySection } from '@/components/staff/pay';
import { Avatar, IconButton, Segmented, StatusPill, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

type Tab = 'overview' | 'attendance' | 'ledger' | 'pay';

/**
 * Staff detail (design: "Staff detail"): header with today's status, then Overview · Attendance
 * · Ledger · Pay, each shown with the permission the website uses (yourself always).
 */
export default function StaffDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useSession();
  const { c } = useTheme();
  const [info, setInfo] = useState<StaffOverview | null | undefined>(undefined);
  const [todayCell, setTodayCell] = useState<GridCell | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const self = me?.personId === id;
  const canMoney = self || can('salary.view');
  const canPay = self || can('staff.pay.view');

  const load = useCallback(async () => {
    if (!me || !id) return;
    const today = businessDateOf(new Date());
    const { year, month } = monthOf(today);
    const [person, monthData] = await Promise.all([
      loadStaffOverview(supabase, me.shopId, id, canMoney),
      loadAttendanceMonth(supabase, me.shopId, year, month, today),
    ]);
    setInfo(person);
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

            <Segmented
              label={t('staffDetail.tabs.label')}
              value={tab}
              onChange={setTab}
              options={tabs.map((x) => ({ value: x, label: t(`staffDetail.tabs.${x}`) }))}
            />

            {tab === 'overview' && <OverviewSection info={info} onChanged={load} />}
            {tab === 'attendance' && (
              <AttendanceSection staffId={info.id} name={info.name} onChanged={load} />
            )}
            {tab === 'ledger' && <LedgerSection staffId={info.id} />}
            {tab === 'pay' && <PaySection staffId={info.id} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
