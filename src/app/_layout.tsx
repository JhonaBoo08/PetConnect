import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { ready, user } = useSession();
  const isOwner = Boolean(user && user.accountType === 'owner');
  const isVet = Boolean(user && user.accountType === 'vet');

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {ready ? (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={isOwner}>
            <Stack.Screen name="dashboard" />
            <Stack.Screen name="alerts" />
            <Stack.Screen name="alert-details" />
            <Stack.Screen name="found-report" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="pet-id" />
            <Stack.Screen name="my-pets" />
            <Stack.Screen name="add-pet" />
            <Stack.Screen name="add-reminder" />
            <Stack.Screen name="add-record" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="emergency-contact" />
            <Stack.Screen name="linked-pets" />
            <Stack.Screen name="preferences" />
            <Stack.Screen name="health-records" />
            <Stack.Screen name="health-reminders" />
            <Stack.Screen name="record-details" />
            <Stack.Screen name="reminder-details" />
            <Stack.Screen name="view-reminder" />
          </Stack.Protected>
          <Stack.Protected guard={isVet}>
            <Stack.Screen name="clinic" />
            <Stack.Screen name="clinic-scan-result" />
            <Stack.Screen name="clinic-records" />
            <Stack.Screen name="clinic-add-record" />
            <Stack.Screen name="clinic-notifications" />
            <Stack.Screen name="clinic-profile" />
            <Stack.Screen name="clinic-edit" />
            <Stack.Screen name="clinic-staff" />
            <Stack.Screen name="clinic-preferences" />
            <Stack.Screen name="clinic-feedback" />
            <Stack.Screen name="clinic-verification" />
          </Stack.Protected>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="create-account" />
          <Stack.Screen name="owner-details" />
          <Stack.Screen name="vet-details" />
          <Stack.Screen name="scan" />
          <Stack.Screen name="scan-result" />
        </Stack>
      ) : null}
    </ThemeProvider>
  );
}