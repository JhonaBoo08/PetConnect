import Constants from "expo-constants";
import { Platform } from "react-native";

export function developmentServerOrigin(): string | undefined {
  if (
    !__DEV__ ||
    (process.env.EXPO_PUBLIC_FIREBASE_ENV ?? "emulator") !== "emulator"
  ) {
    return undefined;
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  const host = Constants.expoConfig?.hostUri;
  if (!host) return undefined;
  const url = new URL(host.includes("://") ? host : `http://${host}`);
  if (url.hostname.endsWith(".exp.direct")) url.protocol = "https:";
  return url.origin;
}

export function authEmulatorUrl(): string {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST;
  return host
    ? `http://${host}:9099`
    : developmentServerOrigin() || "http://127.0.0.1:9099";
}
