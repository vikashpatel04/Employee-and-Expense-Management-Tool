import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronRight, Search } from 'lucide-react-native';
import { businessDateOf, formatDisplayDate, monthOf } from '@fincrew/core';
import {
  loadAttendanceMonth,
  loadStaffList,
  type GridCell,
  type StaffListItem,
} from '@fincrew/data';
import type { StatusKey } from '@fincrew/ui';
import { ShopHeader } from '@/components/shop-header';
import { Avatar, Card, Segmented, StatusPill, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, size, space, textStyle, useTheme } from '@/lib/theme';

type Filter = 'active' | 'left' | 'all';

/** Staff (PLAN §6.1): search, Active / Left / All, today's status; tap for the person's details. */
export default function Staff() {
  const { me } = useSession();
  const { c } = useTheme();
  const [people, setPeople] = useState<StaffListItem[] | null>(null);
  const [todayCells, setTodayCells] = useState<Map<string, GridCell>>(new Map());
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const today = businessDateOf(new Date());
    const { year, month } = monthOf(today);
    const [list, month_] = await Promise.all([
      loadStaffList(supabase, me.shopId),
      loadAttendanceMonth(supabase, me.shopId, year, month, today),
    ]);
    setPeople(list);
    setTodayCells(
      new Map(
        month_.rows.flatMap((r) => {
          const cell = r.cells.find((x) => x.date === today);
          return cell ? [[r.staffId, cell] as const] : [];
        }),
      ),
    );
    setLoading(false);
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (people ?? []).filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!term ||
          p.name.toLowerCase().includes(term) ||
          (p.phone ?? '').replace(/\s/g, '').includes(term.replace(/\s/g, ''))),
    );
  }, [people, filter, q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: space['space-4'], gap: space['space-4'] }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
      >
        <ShopHeader />
        <View style={{ gap: 2 }}>
          <Text variant="title-xl">{t('mobile.staff.title')}</Text>
          {people && (
            <Text muted>
              {t('mobile.staff.count', {
                count: people.filter((p) => p.status === 'active').length,
              })}
            </Text>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['space-2'],
            minHeight: size['tap-min'],
            paddingHorizontal: space['space-3'],
            borderRadius: radius['radius-sm'],
            borderWidth: 1,
            borderColor: c['line-strong'],
            backgroundColor: c.surface,
          }}
        >
          <Search size={20} color={c['ink-muted']} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('mobile.staff.search')}
            placeholderTextColor={c['ink-subtle']}
            accessibilityLabel={t('mobile.staff.search')}
            autoCorrect={false}
            style={[textStyle('body-lg'), { flex: 1, color: c.ink, minHeight: 44 }]}
          />
        </View>

        <Segmented
          label={t('staff.filter.label')}
          value={filter}
          onChange={setFilter}
          options={(['active', 'left', 'all'] as const).map((v) => ({
            value: v,
            label: t(`staff.filter.${v}`),
          }))}
        />

        {people && people.length === 0 && <Text muted>{t('mobile.staff.empty')}</Text>}
        {people && people.length > 0 && shown.length === 0 && q.trim() !== '' && (
          <Text muted>{t('mobile.staff.noMatch', { q: q.trim() })}</Text>
        )}

        {shown.length > 0 && (
          <Card>
            {shown.map((p) => {
              const cell = todayCells.get(p.id);
              const showStatus = cell && cell.status !== 'future' && cell.status !== 'not_employed';
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={p.name}
                  onPress={() => router.push({ pathname: '/staff/[id]', params: { id: p.id } })}
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
                  <Avatar name={p.name} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {p.phone ? `${p.phone} · ` : ''}
                      {p.status === 'left' && p.leavingDate
                        ? t('staffDetail.left', { date: formatDisplayDate(p.leavingDate) })
                        : t('mobile.staff.joined', { date: formatDisplayDate(p.joiningDate) })}
                    </Text>
                  </View>
                  {showStatus && <StatusPill status={cell.status as StatusKey} />}
                  <ChevronRight size={20} color={c['ink-muted']} />
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
