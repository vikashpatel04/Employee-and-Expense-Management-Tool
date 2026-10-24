import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '@/lib/i18n';
import { space, useTheme } from '@/lib/theme';
import { ShopHeader } from './shop-header';
import { Card, Text } from './ui';

/** A tab that isn't built yet: says so plainly and points to the website. */
export function ComingNext({ title }: { title: string }) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ padding: space['space-4'], gap: space['space-4'] }}>
        <ShopHeader />
        <Text variant="title-xl">{title}</Text>
        <Card style={{ padding: space['space-5'], gap: space['space-1'] }}>
          <Text variant="title-md">{t('mobile.next.title')}</Text>
          <Text muted>{t('mobile.next.body')}</Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}
