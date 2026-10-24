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
import { AuthProvider, useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

/** Root: fonts, the phone's Staffora sign-in, and which screens are open in each state. */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    AnekLatin_400Regular,
    AnekLatin_500Medium,
    AnekLatin_600SemiBold,
    AnekLatin_700Bold,
  });
  return (
    <AuthProvider>
      <Gate fontsLoaded={fontsLoaded} />
    </AuthProvider>
  );
}

/**
 * Not set up on this phone → Welcome (open the invite link). Set up but closed → PIN.
 * Opened → the tabs and the check-in screens. The invite screen is always reachable, so a new
 * link can reset the PIN.
 */
function Gate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready, profile, unlocked } = useAuth();
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
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={!!profile && !unlocked}>
          <Stack.Screen name="pin" />
        </Stack.Protected>
        <Stack.Protected guard={unlocked}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="enter-code" />
          <Stack.Screen name="scan" />
          <Stack.Screen name="checked-in" />
        </Stack.Protected>
        <Stack.Screen name="join/[token]" />
      </Stack>
    </>
  );
}
