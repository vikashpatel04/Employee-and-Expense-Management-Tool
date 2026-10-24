import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Link2 } from 'lucide-react-native';
import { Button, Text } from '@/components/ui';
import { t } from '@/lib/i18n';
import { radius, space, textStyle, useTheme } from '@/lib/theme';

/** The invite token inside a pasted link (…/join/<48 hex>) or the token itself. */
function tokenOf(text: string): string | null {
  const m = /([0-9a-f]{48})/.exec(text.trim());
  return m ? m[1]! : null;
}

/**
 * First open, before any invite (PLAN §6.3): what Staffora is and how to start — open the link
 * the shop sent. Pasting the link here works too (and is how it's tried in a browser).
 */
export default function Welcome() {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const w = 'staffora.welcome';

  const open = () => {
    const token = tokenOf(text);
    if (!token) return setBad(true);
    router.push({ pathname: '/join/[token]', params: { token } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ flex: 1, padding: space['space-6'], paddingTop: 72, gap: space['space-4'] }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Link2 size={32} color={c['on-accent']} />
        </View>
        <Text variant="title-xl">{t(`${w}.title`)}</Text>
        <Text variant="body-lg">{t(`${w}.body`)}</Text>
        <Text variant="body-lg" muted>
          {t(`${w}.howTo`)}
        </Text>
      </View>
      <View style={{ padding: space['space-4'], gap: space['space-2'] }}>
        <Text variant="caption" muted>
          {t(`${w}.pasteLabel`)}
        </Text>
        <TextInput
          accessibilityLabel={t(`${w}.pasteLabel`)}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setBad(false);
          }}
          placeholder={t(`${w}.pastePlaceholder`)}
          placeholderTextColor={c['ink-subtle']}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            textStyle('body'),
            {
              minHeight: 48,
              paddingHorizontal: space['space-3'],
              borderRadius: radius['radius-sm'],
              borderWidth: 1,
              borderColor: bad ? c.danger : c['line-strong'],
              backgroundColor: c.surface,
              color: c.ink,
            },
          ]}
        />
        {bad && <Text color={c.danger}>{t(`${w}.bad`)}</Text>}
        <Button label={t(`${w}.open`)} block onPress={open} disabled={!text.trim()} />
      </View>
    </SafeAreaView>
  );
}
