import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { Platform } from "react-native";

import type { Coordinates } from "../../../shared/contracts";
import { registerPushDevice, unregisterPushDevice } from "./recovery-network";

const pushTokenStorageKey = "petconnect.recoveryPushToken";

type NotificationsModule = typeof import("expo-notifications");

function isExpoGo(): boolean {
  return (
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === "storeClient"
  );
}

let notificationsPromise: Promise<NotificationsModule> | undefined;

async function loadNotifications(): Promise<NotificationsModule> {
  notificationsPromise ??= import("expo-notifications").then((module) => {
    module.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return module;
  });
  return notificationsPromise;
}

export async function observeNotificationResponses(
  open: (data: Record<string, unknown>) => void,
): Promise<() => void> {
  if (Platform.OS === "web" || isExpoGo()) return () => {};
  const Notifications = await loadNotifications();
  const handled = new Set<string>();
  const handle = (
    response: import("expo-notifications").NotificationResponse | null,
  ) => {
    if (
      !response ||
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
    )
      return;
    const request = response.notification?.request;
    const data = request?.content?.data;
    if (
      !request?.identifier ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    )
      return;
    const key = request.identifier + ":" + response.actionIdentifier;
    if (handled.has(key)) return;
    handled.add(key);
    open(data);
    Notifications.clearLastNotificationResponse();
  };
  const subscription =
    Notifications.addNotificationResponseReceivedListener(handle);
  handle(Notifications.getLastNotificationResponse());
  return () => subscription.remove();
}

const pushCoordinatesStorageKey = "petconnect.recoveryPushCoordinates";

export async function observePushTokenChanges(): Promise<() => void> {
  if (Platform.OS === "web" || isExpoGo()) return () => {};
  const projectId = expoProjectId();
  if (!projectId) return () => {};
  const Notifications = await loadNotifications();
  let active = true;
  let pending = Promise.resolve();
  const refresh = async (
    devicePushToken?: import("expo-notifications").DevicePushToken,
  ) => {
    const previousToken = await AsyncStorage.getItem(pushTokenStorageKey);
    if (!active || !previousToken) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!active || permission.status !== "granted") return;
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
        ...(devicePushToken ? { devicePushToken } : {}),
      })
    ).data;
    const savedCoordinates = await AsyncStorage.getItem(
      pushCoordinatesStorageKey,
    );
    let coordinates: Coordinates | undefined;
    if (savedCoordinates) {
      try {
        const saved = JSON.parse(savedCoordinates) as Coordinates;
        if (Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude))
          coordinates = saved;
      } catch {
        coordinates = undefined;
      }
    }
    if (!active) return;
    await registerPushDevice({
      expoPushToken: token,
      platform: Platform.OS as "ios" | "android",
      ...(coordinates || {}),
    });
    if (!active) return;
    await AsyncStorage.setItem(pushTokenStorageKey, token);
    if (previousToken !== token) {
      try {
        await unregisterPushDevice(previousToken);
      } catch {
        // Receipts also disable stale registrations if cleanup is offline.
      }
    }
  };
  const subscription = Notifications.addPushTokenListener((token) => {
    pending = pending.then(() => refresh(token)).catch(() => {});
  });
  try {
    await refresh();
  } catch {
    // Keep the stored opt-in and retry on a token change or next app start.
  }
  return () => {
    active = false;
    subscription.remove();
  };
}

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
  if (Platform.OS === "web" || isExpoGo()) {
    return {
      enabled: false,
      reason:
        "Recovery push notifications require a development build or an installed iOS or Android build, not Expo Go.",
    };
  }

  const Notifications = await loadNotifications();

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
    const previousToken = await AsyncStorage.getItem(pushTokenStorageKey);
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
    // Persist first so a partially failed registration can still be cleaned up
    // during sign-out instead of leaving an orphaned server-side push token.
    await AsyncStorage.setItem(pushTokenStorageKey, token);
    if (coordinates) {
      await AsyncStorage.setItem(
        pushCoordinatesStorageKey,
        JSON.stringify(coordinates),
      );
    } else {
      await AsyncStorage.removeItem(pushCoordinatesStorageKey);
    }
    await registerPushDevice({
      expoPushToken: token,
      platform: Platform.OS as "ios" | "android",
      ...(coordinates || {}),
    });
    if (previousToken && previousToken !== token) {
      try {
        await unregisterPushDevice(previousToken);
      } catch {
        // The new token is already active. A stale previous token can be
        // disabled later by Expo receipts or removed on a future registration.
      }
    }
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
  if (Platform.OS === "web" || isExpoGo()) return;
  const token = await AsyncStorage.getItem(pushTokenStorageKey);
  if (!token) return;
  await unregisterPushDevice(token);
  await AsyncStorage.removeItem(pushTokenStorageKey);
  await AsyncStorage.removeItem(pushCoordinatesStorageKey);
}
