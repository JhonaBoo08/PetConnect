import { beforeEach, expect, it, jest } from "@jest/globals";

const mockLastResponse = jest.fn();
const mockRemove = jest.fn();
const mockClear = jest.fn();
const mockStorage = new Map<string, string>();
const mockGetToken =
  jest.fn<(options?: unknown) => Promise<{ data: string }>>();
const mockRegister = jest.fn<(input: unknown) => Promise<void>>();
const mockUnregister = jest.fn<(token: string) => Promise<void>>();
let mockTokenListener: ((token: unknown) => void) | undefined;
let mockListener: ((response: unknown) => void) | undefined;
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    executionEnvironment: "standalone",
    easConfig: { projectId: "test-project" },
  },
}));
jest.mock("expo-location", () => ({}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key);
    },
  },
}));
jest.mock("@/services/recovery-network", () => ({
  registerPushDevice: (input: unknown) => mockRegister(input),
  unregisterPushDevice: (token: string) => mockUnregister(token),
}));
jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "default",
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: async () => ({ status: "granted" }),
  getExpoPushTokenAsync: (options: unknown) => mockGetToken(options),
  addPushTokenListener: (listener: (token: unknown) => void) => {
    mockTokenListener = listener;
    return { remove: mockRemove };
  },
  addNotificationResponseReceivedListener: (
    listener: (response: unknown) => void,
  ) => {
    mockListener = listener;
    return { remove: mockRemove };
  },
  getLastNotificationResponse: () => mockLastResponse(),
  clearLastNotificationResponse: () => mockClear(),
}));
import {
  observeNotificationResponses,
  observePushTokenChanges,
} from "../device-recovery";

const response = (id: string, data: Record<string, unknown>) => ({
  actionIdentifier: "default",
  notification: { request: { identifier: id, content: { data } } },
});
beforeEach(() => {
  jest.clearAllMocks();
  mockListener = undefined;
  mockTokenListener = undefined;
  mockStorage.clear();
  mockGetToken.mockResolvedValue({ data: "old-token" });
  mockRegister.mockResolvedValue(undefined);
  mockUnregister.mockResolvedValue(undefined);
  mockLastResponse.mockReturnValue(null);
});
it("handles cold startup and warm taps once, then removes its subscription", async () => {
  const cold = response("cold", { reminderId: "RM-LUNA" });
  mockLastResponse.mockReturnValue(cold);
  const open = jest.fn();
  const stop = await observeNotificationResponses(open);
  expect(open).toHaveBeenCalledWith({ reminderId: "RM-LUNA" });
  mockListener?.(cold);
  expect(open).toHaveBeenCalledTimes(1);
  mockListener?.(
    response("warm", { reportId: "LR-BANTAY", type: "PET_SIGHTED" }),
  );
  expect(open).toHaveBeenLastCalledWith({
    reportId: "LR-BANTAY",
    type: "PET_SIGHTED",
  });
  stop();
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
it("refreshes a rolled token while preserving nearby opt-in and removes the old registration", async () => {
  mockStorage.set("petconnect.recoveryPushToken", "old-token");
  mockStorage.set(
    "petconnect.recoveryPushCoordinates",
    JSON.stringify({ latitude: 7.1, longitude: 125.6, accuracyM: 15 }),
  );
  const stop = await observePushTokenChanges();
  mockGetToken.mockResolvedValue({ data: "new-token" });
  const nativeToken = { type: "android", data: "new-native-token" };
  mockTokenListener?.(nativeToken);
  await flush();
  expect(mockGetToken).toHaveBeenLastCalledWith({
    projectId: "test-project",
    devicePushToken: nativeToken,
  });
  expect(mockRegister).toHaveBeenLastCalledWith({
    expoPushToken: "new-token",
    platform: "ios",
    latitude: 7.1,
    longitude: 125.6,
    accuracyM: 15,
  });
  expect(mockStorage.get("petconnect.recoveryPushToken")).toBe("new-token");
  expect(mockUnregister).toHaveBeenCalledWith("old-token");
  stop();
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
it("keeps push opt-in and stops refresh work after disposal", async () => {
  const stop = await observePushTokenChanges();
  mockTokenListener?.({ type: "ios", data: "native" });
  await flush();
  expect(mockRegister).not.toHaveBeenCalled();
  mockStorage.set("petconnect.recoveryPushToken", "old-token");
  stop();
  mockTokenListener?.({ type: "ios", data: "native" });
  await flush();
  expect(mockRegister).not.toHaveBeenCalled();
});
it("preserves the previous registration when refresh cannot reach the API", async () => {
  mockStorage.set("petconnect.recoveryPushToken", "old-token");
  const stop = await observePushTokenChanges();
  mockGetToken.mockResolvedValue({ data: "new-token" });
  mockRegister.mockRejectedValue(new Error("offline"));
  mockTokenListener?.({ type: "ios", data: "native" });
  await flush();
  expect(mockStorage.get("petconnect.recoveryPushToken")).toBe("old-token");
  expect(mockUnregister).not.toHaveBeenCalled();
  stop();
});
it("ignores malformed notification payloads", async () => {
  const open = jest.fn();
  const stop = await observeNotificationResponses(open);
  mockListener?.({
    notification: {
      request: {
        identifier: "bad",
        content: { data: "https://outside.example.test" },
      },
    },
  });
  expect(open).not.toHaveBeenCalled();
  stop();
});
