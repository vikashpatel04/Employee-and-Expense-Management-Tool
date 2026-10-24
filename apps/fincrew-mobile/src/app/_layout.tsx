import {
  AnekLatin_400Regular,
  AnekLatin_500Medium,
  AnekLatin_600SemiBold,
  AnekLatin_700Bold,
  useFonts,
} from '@expo-google-fonts/anek-latin';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

/** Root: fonts, sign-in state, and the guard between the sign-in screen and the app. */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    AnekLatin_400Regular,
    AnekLatin_500Medium,
    AnekLatin_600SemiBold,
    AnekLatin_700Bold,
  });
  return (
    <SessionProvider>
      <Gate fontsLoaded={fontsLoaded} />
    </SessionProvider>
  );
}

function Gate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready, session } = useSession();
  const { c, scheme } = useTheme();
  const show = ready && fontsLoaded;
  useEffect(() => {
    if (show) void SplashScreen.hideAsync();
  }, [show]);
  if (!show) return null;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.canvas } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="staff/[id]" />
          <Stack.Screen name="expense" />
          <Stack.Screen name="salary/[month]" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
