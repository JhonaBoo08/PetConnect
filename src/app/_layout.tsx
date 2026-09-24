import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="create-account" />
        <Stack.Screen name="owner-details" />
        <Stack.Screen name="vet-details" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="scan" />
        <Stack.Screen name="scan-result" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="alert-details" />
        <Stack.Screen name="found-report" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="pet-id" />
        <Stack.Screen name="my-pets" />
        <Stack.Screen name="add-pet" />
        <Stack.Screen name="add-reminder" />
        <Stack.Screen name="notifications" />
      </Stack>
    </ThemeProvider>
  );
}
