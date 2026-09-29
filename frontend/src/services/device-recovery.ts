import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Coordinates } from "../../../shared/contracts";
import { registerPushDevice, unregisterPushDevice } from "./recovery-network";

const pushTokenStorageKey = "petconnect.recoveryPushToken";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestCurrentCoordinates(): Promise<Coordinates> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error(
      "Location permission is needed to place recovery pins and find nearby reports.",
    );
  }
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyM: location.coords.accuracy,
  };
}

function expoProjectId(): string | null {
  const configured = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (configured) return configured;
  const expoExtra = Constants.expoConfig?.extra as
    { eas?: { projectId?: string } } | undefined;
  return expoExtra?.eas?.projectId || Constants.easConfig?.projectId || null;
}

export type PushRegistrationResult =
  { enabled: true; token: string } | { enabled: false; reason: string };

export async function enableRecoveryPush(
  coordinates?: Coordinates,
): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return {
      enabled: false,
      reason:
        "Recovery push notifications require an installed iOS or Android build.",
    };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("recovery", {
      name: "Recovery alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    return {
      enabled: false,
      reason: "Notification permission was not granted.",
    };
  }

  const projectId = expoProjectId();
  if (!projectId) {
    return {
      enabled: false,
      reason:
        "Set EXPO_PUBLIC_EAS_PROJECT_ID or configure the EAS project ID before registering remote push.",
    };
  }

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
    // Persist first so a partially failed registration can still be cleaned up
    // during sign-out instead of leaving an orphaned server-side push token.
    await AsyncStorage.setItem(pushTokenStorageKey, token);
    await registerPushDevice({
      expoPushToken: token,
      platform: Platform.OS as "ios" | "android",
      ...(coordinates || {}),
    });
    return { enabled: true, token };
  } catch (error) {
    return {
      enabled: false,
      reason:
        error instanceof Error
          ? error.message
          : "Could not register this device for recovery push notifications.",
    };
  }
}

export async function disableRecoveryPush(): Promise<void> {
  if (Platform.OS === "web") return;
  const token = await AsyncStorage.getItem(pushTokenStorageKey);
  if (!token) return;
  await unregisterPushDevice(token);
  await AsyncStorage.removeItem(pushTokenStorageKey);
}
