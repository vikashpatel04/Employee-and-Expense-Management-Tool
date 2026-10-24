import { Linking, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExternalLink, LogOut } from 'lucide-react-native';
import { ShopHeader } from '@/components/shop-header';
import { Button, Card, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { space, useTheme } from '@/lib/theme';

const WEBSITE = 'https://fincrew-web.vercel.app';

/** More: who is signed in, shops, the website for everything not on the phone yet, sign out. */
export default function More() {
  const { me, signOut } = useSession();
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ padding: space['space-4'], gap: space['space-4'] }}>
        <ShopHeader />
        <Text variant="title-xl">{t('mobile.more.title')}</Text>
        {me && (
          <Card style={{ padding: space['space-5'], gap: space['space-1'] }}>
            <Text variant="label">{t('mobile.more.signedInAs', { name: me.name })}</Text>
            {me.isOwner && <Text muted>{t('mobile.more.owner')}</Text>}
          </Card>
        )}
        <Card style={{ padding: space['space-5'], gap: space['space-3'] }}>
          <Text muted>{t('mobile.more.website', { url: WEBSITE })}</Text>
          <Button
            label={t('mobile.more.openWebsite')}
            variant="secondary"
            icon={ExternalLink}
            onPress={() => void Linking.openURL(WEBSITE)}
          />
        </Card>
        <Button label={t('auth.signOut')} variant="quiet" icon={LogOut} onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}
