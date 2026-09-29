import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { Palette } from "@/constants/palette";
import { AuthProvider, useAuth } from "@/services/auth-context";

void SplashScreen.preventAutoHideAsync();

function AppNavigator() {
  const { state } = useAuth();
  if (state.status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Palette.forestDark} />
      </View>
    );
  }

  const guest = state.status === "guest";
  const owner = state.status === "ready" && state.session.role === "OWNER";
  const clinic = state.status === "ready" && state.session.role === "CLINIC";
  const issue = state.status === "blocked" || state.status === "error";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="scan" />
      <Stack.Screen name="recover" />
      <Stack.Protected guard={guest}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={guest || state.status === "setup"}>
        <Stack.Screen name="create-account" />
      </Stack.Protected>
      <Stack.Protected guard={owner}>
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="privacy-settings" />
        <Stack.Screen name="pet-id" />
        <Stack.Screen name="add-pet" />
        <Stack.Screen name="health-reminders" />
        <Stack.Screen name="reminder-details" />
      </Stack.Protected>
      <Stack.Protected guard={clinic}>
        <Stack.Screen name="clinic-dashboard" />
        <Stack.Screen name="clinic-scan" />
        <Stack.Screen name="clinic-patient" />
      </Stack.Protected>
      <Stack.Protected guard={issue}>
        <Stack.Screen name="session-status" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.cream,
  },
});
