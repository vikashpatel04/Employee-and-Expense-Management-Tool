import { Tabs } from 'expo-router/tabs';
import { Grid2x2, Sun, Users, Wallet } from 'lucide-react-native';
import { t } from '@/lib/i18n';
import { size, textStyle, useTheme } from '@/lib/theme';

/** Bottom tabs (PLAN §6.1): Today · Staff · Money · More. */
export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c['accent-ink'],
        tabBarInactiveTintColor: c['ink-muted'],
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          height: size['tab-bar'] + 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: textStyle('micro'),
        sceneStyle: { backgroundColor: c.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('mobile.tabs.today'),
          tabBarIcon: ({ color }) => <Sun size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          title: t('mobile.tabs.staff'),
          tabBarIcon: ({ color }) => <Users size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: t('mobile.tabs.money'),
          tabBarIcon: ({ color }) => <Wallet size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('mobile.tabs.more'),
          tabBarIcon: ({ color }) => <Grid2x2 size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
