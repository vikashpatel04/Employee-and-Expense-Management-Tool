import { Tabs } from 'expo-router/tabs';
import { CalendarDays, House, User, Wallet } from 'lucide-react-native';
import { t } from '@/lib/i18n';
import { size, textStyle, useTheme } from '@/lib/theme';

/** Bottom tabs (PLAN §6.3): Home · Attendance · Money · Me. */
export default function TabsLayout() {
  const { c } = useTheme();
  const tab = (name: string, Icon: typeof House) => (
    <Tabs.Screen
      name={name}
      options={{
        title: t(`staffora.tabs.${name === 'index' ? 'home' : name}`),
        tabBarIcon: ({ color }) => <Icon size={24} color={color} />,
      }}
    />
  );
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
      {tab('index', House)}
      {tab('attendance', CalendarDays)}
      {tab('money', Wallet)}
      {tab('me', User)}
    </Tabs>
  );
}
