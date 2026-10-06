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
    // Custom Expo schemes must be converted before parsing: URL.protocol
    // cannot switch a non-HTTP URL into an HTTP URL.
    const url = new URL(
      withProtocol.replace(/^exp:/i, "http:").replace(/^exps:/i, "https:"),
    );

    // Expo tunnel hosts redirect plain HTTP to HTTPS. Firebase Auth's React
    // Native transport is more reliable when pointed at the final secure
    // origin directly instead of depending on that redirect.
    if (
      /\.(?:exp\.direct|ngrok\.io|ngrok-free\.app|ngrok\.app)$/i.test(
        url.hostname,
      )
    ) {
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

function isPhoneLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "")
      .toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      /^127\./.test(host) ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host === "::"
    );
  } catch {
    return true;
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
    if (!origin) continue;
    // A physical phone interprets localhost/127.0.0.1 as the phone itself.
    // Expo can expose multiple runtime hints, so ignore loopback/wildcard
    // candidates on native and keep looking for the LAN or tunnel address.
    if (Platform.OS !== "web" && isPhoneLoopbackOrigin(origin)) continue;
    return origin;
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
