import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { radius, space, useTheme } from '@/lib/theme';
import { Sheet } from './sheet';
import { Avatar, Text } from './ui';

/** Current shop at the top of a screen; opens "Your shops" to switch (design: Today · switch shop). */
export function ShopHeader() {
  const { me, switchShop } = useSession();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const many = me.memberships.length > 1;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.switchShop', { name: me.shopName })}
        disabled={!many}
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'], minHeight: 52 }}
      >
        <Avatar name={me.shopName} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label-sm" numberOfLines={1}>
            {me.shopName}
          </Text>
          <Text variant="caption" muted>
            {t('mobile.shops.count', { count: me.memberships.length })}
          </Text>
        </View>
        {many && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text variant="label-sm" color={c['accent-ink']}>
              {t('mobile.shops.switch')}
            </Text>
            <ChevronDown size={20} color={c['accent-ink']} />
          </View>
        )}
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('mobile.shops.title')}>
        {me.memberships.map((m) => {
          const current = m.shopId === me.shopId;
          return (
            <Pressable
              key={m.shopId}
              accessibilityRole="radio"
              accessibilityState={{ checked: current }}
              onPress={async () => {
                setOpen(false);
                if (!current) await switchShop(m.shopId);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space['space-3'],
                minHeight: 72,
                paddingHorizontal: space['space-4'],
                borderRadius: radius['radius-md'],
                backgroundColor: current ? c['accent-soft'] : c.surface,
                borderWidth: current ? 2 : 1,
                borderColor: current ? c.accent : c.line,
              }}
            >
              <Avatar name={m.shopName} />
              <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
                {m.shopName}
              </Text>
              {current && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Check size={20} color={c['accent-ink']} />
                  <Text variant="caption" color={c['accent-ink']}>
                    {t('mobile.shops.current')}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}
