import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator } from "firebase/auth";
import { persistentAuth } from "./persistence";

let cached: ReturnType<typeof createClient> | undefined;
function createClient() {
  // Explicit opt-in to live environments. Local work never uses a live project.
  const environment = process.env.EXPO_PUBLIC_FIREBASE_ENV ?? "emulator";
  if (!["emulator", "dev", "staging"].includes(environment))
    throw new Error("Unknown Firebase environment");
  const emulator = environment === "emulator";
  const projectId = emulator
    ? "demo-petconnect"
    : process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const expected =
    environment === "staging" ? "petconnect-staging-4069d" : "petconnect-8e685";
  if (
    !emulator &&
    (projectId !== expected ||
      !process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
      !process.env.EXPO_PUBLIC_FIREBASE_APP_ID)
  )
    throw new Error(
      "Firebase environment configuration is incomplete or mismatched",
    );
  const name = `petconnect-${environment}`;
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
  if (emulator && !existing) {
    const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  }
  return { auth };
}

export function firebaseClient() {
  return (cached ??= createClient());
}
