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
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
    <KeyboardProvider>
      <AuthProvider>
        <Gate fontsLoaded={fontsLoaded} />
      </AuthProvider>
    </KeyboardProvider>
  );
}

/**
 * Not set up on this phone → Welcome (phone number, first PIN). Set up but closed → PIN (or
 * fingerprint). Opened → the tabs and the other screens.
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
          <Stack.Screen name="ask" />
          <Stack.Screen name="payslip/[id]" />
          <Stack.Screen name="change-pin" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
