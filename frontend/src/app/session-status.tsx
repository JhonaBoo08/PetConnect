import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Palette } from "@/constants/palette";
import { Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { authErrorMessage, useAuth } from "@/services/auth-context";

export default function SessionStatusScreen() {
  const { state, retry, signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  if (state.status !== "error" && state.status !== "blocked") return null;

  async function handleLogout() {
    setPending(true);
    setActionError("");
    try {
      await signOut();
    } catch (error) {
      setActionError(authErrorMessage(error));
      setPending(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.content}>
        <Text style={styles.title}>Account unavailable</Text>
        <Text style={styles.description}>{state.message}</Text>
        {actionError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {actionError}
          </Text>
        ) : null}
        {state.status === "error" ? (
          <Pressable
            accessibilityRole="button"
            disabled={pending}
            onPress={() => void retry()}
            style={styles.button}
          >
            {pending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Try again</Text>
            )}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={() => void handleLogout()}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.cream, alignItems: "center" },
  content: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
  },
  title: {
    color: Palette.forestDark,
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: "800",
  },
  description: {
    marginTop: Spacing.two,
    color: Palette.inkMuted,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  error: { marginTop: Spacing.three, color: Palette.danger },
  button: {
    marginTop: Spacing.five,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.forestDark,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondary: {
    marginTop: Spacing.three,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: Palette.forestDark, fontSize: 16, fontWeight: "700" },
});
