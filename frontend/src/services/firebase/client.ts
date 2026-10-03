import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator } from "firebase/auth";
import { persistentAuth } from "./persistence";

let cached: ReturnType<typeof createClient> | undefined;

function createClient() {
  // The local Auth emulator is the default until a Firebase project is supplied.
  const environment = process.env.EXPO_PUBLIC_FIREBASE_ENV ?? "emulator";
  if (!["emulator", "dev", "staging", "production"].includes(environment)) {
    throw new Error("Unknown Firebase environment.");
  }
  const emulator = environment === "emulator";
  const projectId = emulator
    ? "demo-petconnect"
    : process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (
    !projectId ||
    (!emulator &&
      (!process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
        !process.env.EXPO_PUBLIC_FIREBASE_APP_ID))
  ) {
    throw new Error(
      "Firebase configuration is incomplete. Check frontend/.env.local.",
    );
  }

  const name = `petconnect-${environment}-${projectId}`;
  const existing = getApps().find((app) => app.name === name);
  const app =
    existing ??
    initializeApp(
      {
        projectId,
        apiKey: emulator
          ? "demo-key"
          : process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        appId: emulator ? "demo-app" : process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
        authDomain: emulator
          ? "demo-petconnect.firebaseapp.com"
          : process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      },
      name,
    );
  const auth = persistentAuth(app);
  if (emulator) {
    // Guard on the Auth instance itself rather than on whether the app was
    // just created. Fast Refresh re-runs this module and the module-level
    // cache is rebuilt, but getApps() still returns the already-created app.
    // Keying off `existing` would then skip connectAuthEmulator and silently
    // send requests to the real demo-petconnect.firebaseapp.com endpoints
    // with the placeholder "demo-key". Connecting twice is itself an error
    // (auth/emulator-config-failed), so the SDK's own flag is the only safe
    // idempotency check.
    if (!auth.emulatorConfig) {
      const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || "127.0.0.1";
      connectAuthEmulator(auth, `http://${host}:9099`, {
        disableWarnings: true,
      });
    }
  }
  return { auth };
}

export function firebaseClient() {
  return (cached ??= createClient());
}
