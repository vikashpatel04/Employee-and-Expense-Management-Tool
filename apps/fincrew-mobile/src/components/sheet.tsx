import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/lib/i18n';
import { radius, space, useTheme } from '@/lib/theme';
import { Text } from './ui';

/** Bottom sheet (design system BottomSheet): scrim, rounded top, title, content. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel={t('mobile.today.sheet.close')}
          onPress={onClose}
          style={{ position: 'absolute', inset: 0, backgroundColor: c.scrim }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '85%',
            backgroundColor: c.surface,
            borderTopLeftRadius: radius['radius-xl'],
            borderTopRightRadius: radius['radius-xl'],
            paddingTop: space['space-3'],
            paddingBottom: insets.bottom + space['space-4'],
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: c['line-strong'],
              marginBottom: space['space-3'],
            }}
          />
          <View
            style={{ paddingHorizontal: space['space-4'], gap: 2, marginBottom: space['space-3'] }}
          >
            <Text variant="title-md">{title}</Text>
            {subtitle ? <Text muted>{subtitle}</Text> : null}
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: space['space-4'], gap: space['space-2'] }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
