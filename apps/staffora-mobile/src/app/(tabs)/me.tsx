import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, LogOut } from 'lucide-react-native';
import { Avatar, Button, Card, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { space, useTheme } from '@/lib/theme';

/** Me (PLAN §6.3): who you are, lock Staffora (PIN to open again), or remove it from this phone. */
export default function Me() {
  const { profile, lock, forget } = useAuth();
  const { c } = useTheme();
  const m = 'staffora.me';
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ padding: space['space-4'], gap: space['space-4'] }}>
        <Text variant="title-xl">{t(`${m}.title`)}</Text>
        <Card
          style={{
            padding: space['space-4'],
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['space-3'],
          }}
        >
          <Avatar name={profile?.name ?? ''} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="title-md">{profile?.name ?? ''}</Text>
            <Text muted>{profile?.shopName ?? ''}</Text>
          </View>
        </Card>
        <View style={{ gap: space['space-1'] }}>
          <Button
            label={t(`${m}.lock`)}
            variant="secondary"
            icon={Lock}
            block
            onPress={() => void lock()}
          />
          <Text variant="caption" muted>
            {t(`${m}.lockHint`)}
          </Text>
        </View>
        <View style={{ gap: space['space-1'] }}>
          <Button
            label={t(`${m}.forget`)}
            variant="quiet"
            icon={LogOut}
            onPress={() => void forget()}
          />
          <Text variant="caption" muted>
            {t(`${m}.forgetHint`)}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
