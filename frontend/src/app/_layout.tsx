import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
  useRouter,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { Palette } from "@/constants/palette";
import { notificationTarget } from "@/lib/notification-target";
import {
  observeNotificationResponses,
  observePushTokenChanges,
} from "@/services/device-recovery";
import { AuthProvider, useAuth } from "@/services/auth-context";

void SplashScreen.preventAutoHideAsync();

function AppNavigator() {
  const { state, refreshing } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const role = state.status === "ready" ? state.session.role : null;

  useEffect(() => {
    if (!role) return;
    let active = true;
    const stops: (() => void)[] = [];
    const observers = [
      () =>
        observeNotificationResponses((data) => {
          if (active) router.push(notificationTarget(data, role));
        }),
      observePushTokenChanges,
    ];
    for (const observe of observers) {
      void observe()
        .then((dispose) => {
          if (active) stops.push(dispose);
          else dispose();
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [role, router]);

  useEffect(() => {
    if (state.status === "loading") return;

    const publicRoutes = ["/scan", "/recover"];
    if (publicRoutes.includes(pathname)) return;

    let destination:
      | "/"
      | "/create-account"
      | "/dashboard"
      | "/clinic-dashboard"
      | "/session-status";
    let allowedRoutes: string[];

    if (state.status === "guest") {
      destination = "/";
      allowedRoutes = ["/", "/sign-in", "/reset-password", "/create-account"];
    } else if (state.status === "setup") {
      destination = "/create-account";
      allowedRoutes = ["/create-account"];
    } else if (state.status === "blocked" || state.status === "error") {
      destination = "/session-status";
      allowedRoutes = ["/session-status"];
    } else if (state.session.role === "CLINIC") {
      destination = "/clinic-dashboard";
      allowedRoutes = ["/clinic-dashboard", "/clinic-scan", "/clinic-patient"];
    } else {
      destination = "/dashboard";
      allowedRoutes = [
        "/dashboard",
        "/alerts",
        "/notifications",
        "/recovery-report",
        "/profile",
        "/privacy-settings",
        "/pet-id",
        "/add-pet",
        "/my-pets",
        "/health-reminders",
        "/care-calendar",
        "/reminder-details",
      ];
    }

    if (!allowedRoutes.includes(pathname)) router.replace(destination);
  }, [pathname, router, state]);

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
    <View style={styles.navigator}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: Platform.OS === "ios" ? 180 : undefined,
          contentStyle: { backgroundColor: Palette.cream },
        }}
      >
        <Stack.Screen name="scan" options={{ animation: "fade" }} />
        <Stack.Screen name="recover" options={{ animation: "fade" }} />
        <Stack.Protected guard={guest}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Protected guard={guest || state.status === "setup"}>
          <Stack.Screen name="create-account" />
        </Stack.Protected>
        <Stack.Protected guard={owner}>
          <Stack.Screen name="dashboard" options={{ animation: "fade" }} />
          <Stack.Screen name="alerts" options={{ animation: "fade" }} />
          <Stack.Screen
            name="notifications"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="recovery-report"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen name="profile" options={{ animation: "fade" }} />
          <Stack.Screen
            name="privacy-settings"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="pet-id"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="add-pet"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen name="my-pets" options={{ animation: "fade" }} />
          <Stack.Screen
            name="health-reminders"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="care-calendar"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="reminder-details"
            options={{ animation: "slide_from_right" }}
          />
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

      {refreshing && state.status === "ready" ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={styles.syncFeedback}
        >
          <ActivityIndicator size="small" color={Palette.forestDark} />
          <Text style={styles.syncFeedbackText}>Syncing</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <StatusBar style="dark" />
        <AnimatedSplashOverlay />
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  navigator: {
    flex: 1,
    backgroundColor: Palette.cream,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.cream,
  },
  syncFeedback: {
    position: "absolute",
    top: Platform.OS === "web" ? 12 : 52,
    alignSelf: "center",
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,253,247,0.96)",
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    elevation: 4,
  },
  syncFeedbackText: {
    fontSize: 12,
    fontWeight: "700",
    color: Palette.forestDark,
  },
});
