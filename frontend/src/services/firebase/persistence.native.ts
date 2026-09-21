import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FirebaseApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import type { Persistence } from "firebase/auth";

export function persistentAuth(app: FirebaseApp) {
  // Metro selects Firebase's React Native export; its generic web declarations
  // do not expose this native-only helper.
  const native = FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
  };
  try {
    return native.initializeAuth(app, {
      persistence: native.getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if ((error as { code?: string }).code === "auth/already-initialized")
      return native.getAuth(app);
    throw error;
  }
}
