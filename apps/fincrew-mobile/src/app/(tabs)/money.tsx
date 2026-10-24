import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdvancesSection } from '@/components/money/advances';
import { ExpensesSection } from '@/components/money/expenses';
import { SalarySection } from '@/components/money/salary';
import { Segmented, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { space, useTheme } from '@/lib/theme';

type Segment = 'expenses' | 'salary' | 'advances';

/**
 * Money (design: "Money · expenses / salary / advances", PLAN §6.1): one segment per money area,
 * each shown with the permission the website uses for it.
 */
export default function Money() {
  const { me, can } = useSession();
  const { c } = useTheme();
  const segments: Segment[] = [
    ...(can('expenses.add') || can('expenses.view_all') || can('expenses.edit')
      ? (['expenses'] as const)
      : []),
    ...(can('salary.view') ? (['salary'] as const) : []),
    ...(can('salary.view') || can('advances.give') ? (['advances'] as const) : []),
  ];
  const [picked, setPicked] = useState<Segment | null>(null);
  const segment = picked && segments.includes(picked) ? picked : segments[0];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{
          padding: space['space-4'],
          paddingBottom: space['space-2'],
          gap: space['space-2'],
        }}
      >
        {me && (
          <Text variant="caption" muted numberOfLines={1}>
            {me.shopName}
          </Text>
        )}
        <Text variant="title-xl">{t('mobile.tabs.money')}</Text>
        {segments.length > 1 && segment && (
          <Segmented
            label={t('mobile.money.segments.label')}
            value={segment}
            onChange={setPicked}
            options={segments.map((s) => ({ value: s, label: t(`mobile.money.segments.${s}`) }))}
          />
        )}
      </View>
      {!me || !segment ? (
        <Text muted style={{ padding: space['space-4'] }}>
          {me ? t('mobile.money.none') : t('mobile.noShop')}
        </Text>
      ) : segment === 'expenses' ? (
        <ExpensesSection />
      ) : segment === 'salary' ? (
        <SalarySection />
      ) : (
        <AdvancesSection />
      )}
    </SafeAreaView>
  );
}
