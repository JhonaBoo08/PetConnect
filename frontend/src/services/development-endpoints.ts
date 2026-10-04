import Constants from "expo-constants";
import { Platform } from "react-native";

type ExpoRuntimeHints = {
  expoGoConfig?: { debuggerHost?: string } | null;
  manifest?: { hostUri?: string; debuggerHost?: string } | null;
  manifest2?: {
    extra?: {
      expoClient?: { hostUri?: string };
      expoGo?: { debuggerHost?: string };
    };
  } | null;
  linkingUri?: string;
  experienceUrl?: string;
};

function normalizeOrigin(candidate?: string | null): string | undefined {
  const value = candidate?.trim();
  if (!value) return undefined;

  try {
    const withProtocol = value.includes("://") ? value : `http://${value}`;
    const url = new URL(withProtocol);

    if (url.protocol === "exp:") {
      url.protocol = "http:";
    } else if (url.protocol === "exps:") {
      url.protocol = "https:";
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
}

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

  const runtime = Constants as typeof Constants & ExpoRuntimeHints;
  const candidates = [
    Constants.expoConfig?.hostUri,
    runtime.expoGoConfig?.debuggerHost,
    runtime.manifest2?.extra?.expoClient?.hostUri,
    runtime.manifest2?.extra?.expoGo?.debuggerHost,
    runtime.manifest?.hostUri,
    runtime.manifest?.debuggerHost,
    runtime.linkingUri,
    runtime.experienceUrl,
  ];

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate);
    if (origin) return origin;
  }

  return undefined;
}

export function authEmulatorUrl(): string {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST;
  if (host) return `http://${host}:9099`;

  const origin = developmentServerOrigin();
  if (origin) return origin;

  if (Platform.OS === "web") return "http://127.0.0.1:9099";

  throw new Error(
    "PetConnect could not determine the Expo development server address.",
  );
}
