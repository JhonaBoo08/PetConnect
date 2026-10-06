import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { hostUri: "phone-preview.exp.direct" },
    expoGoConfig: { debuggerHost: undefined },
    manifest2: undefined,
  },
}));
jest.mock("../firebase/client", () => ({ firebaseClient: jest.fn() }));
jest.mock("firebase/auth", () => ({}));

import Constants from "expo-constants";
import { getApiBaseUrl } from "../auth";
import { authEmulatorUrl } from "../development-endpoints";

describe("development API endpoints", () => {
  const previousApi = process.env.EXPO_PUBLIC_API_BASE_URL;
  const previousEnvironment = process.env.EXPO_PUBLIC_FIREBASE_ENV;
  const previousDev = __DEV__;

  afterEach(() => {
    if (previousApi === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = previousApi;
    if (previousEnvironment === undefined)
      delete process.env.EXPO_PUBLIC_FIREBASE_ENV;
    else process.env.EXPO_PUBLIC_FIREBASE_ENV = previousEnvironment;
    globalThis.__DEV__ = previousDev;
    Constants.expoConfig!.hostUri = "phone-preview.exp.direct";
    (
      Constants as typeof Constants & {
        expoGoConfig?: { debuggerHost?: string };
        manifest2?: unknown;
      }
    ).expoGoConfig = { debuggerHost: undefined };
    (
      Constants as typeof Constants & {
        manifest2?: unknown;
      }
    ).manifest2 = undefined;
    Object.assign(Constants, {
      experienceUrl: undefined,
      linkingUri: undefined,
    });
  });

  it("preserves the Expo tunnel scheme instead of phone localhost", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = true;
    expect(getApiBaseUrl()).toBe(
      "https://phone-preview.exp.direct/petconnect-api",
    );
    expect(authEmulatorUrl()).toBe("https://phone-preview.exp.direct");
  });

  it("uses the same Metro port for LAN development", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = true;
    Constants.expoConfig!.hostUri = "192.168.1.12:8081";
    expect(getApiBaseUrl()).toBe("http://192.168.1.12:8081/petconnect-api");
  });

  it("skips a native localhost hint when Expo Go also exposes a reachable LAN host", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = true;
    Constants.expoConfig!.hostUri = "localhost:8081";
    (
      Constants as typeof Constants & {
        expoGoConfig?: { debuggerHost?: string };
      }
    ).expoGoConfig = { debuggerHost: "10.0.17.33:8081" };

    expect(getApiBaseUrl()).toBe("http://10.0.17.33:8081/petconnect-api");
    expect(authEmulatorUrl()).toBe("http://10.0.17.33:8081");
  });

  it("falls back to Expo Go debuggerHost when expoConfig.hostUri is missing", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = true;
    Constants.expoConfig!.hostUri = undefined;
    (
      Constants as typeof Constants & {
        expoGoConfig?: { debuggerHost?: string };
      }
    ).expoGoConfig = { debuggerHost: "192.168.1.33:8081" };

    expect(getApiBaseUrl()).toBe("http://192.168.1.33:8081/petconnect-api");
    expect(authEmulatorUrl()).toBe("http://192.168.1.33:8081");
  });

  it("falls back to the SDK 57 manifest2 host when needed", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = true;
    Constants.expoConfig!.hostUri = undefined;
    (
      Constants as typeof Constants & {
        expoGoConfig?: { debuggerHost?: string };
        manifest2?: {
          extra?: {
            expoClient?: { hostUri?: string };
          };
        };
      }
    ).expoGoConfig = { debuggerHost: undefined };
    (
      Constants as typeof Constants & {
        manifest2?: {
          extra?: {
            expoClient?: { hostUri?: string };
          };
        };
      }
    ).manifest2 = {
      extra: { expoClient: { hostUri: "192.168.1.44:8081" } },
    };

    expect(getApiBaseUrl()).toBe("http://192.168.1.44:8081/petconnect-api");
  });

  it.each([
    ["exp://192.168.1.50:8081/--/dashboard", "http://192.168.1.50:8081"],
    [
      "exp://phone-preview.exp.direct/--/dashboard",
      "https://phone-preview.exp.direct",
    ],
    [
      "exps://phone-preview.exp.direct/--/dashboard",
      "https://phone-preview.exp.direct",
    ],
  ])(
    "uses the Expo experience URL %s when other runtime hints are absent",
    (experienceUrl, origin) => {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
      process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
      globalThis.__DEV__ = true;
      Constants.expoConfig!.hostUri = undefined;
      Object.assign(Constants, { experienceUrl });
      expect(getApiBaseUrl()).toBe(origin + "/petconnect-api");
      expect(authEmulatorUrl()).toBe(origin);
    },
  );

  it("preserves an explicit API override", () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.test/";
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    expect(getApiBaseUrl()).toBe("https://api.example.test");
  });

  it("requires an explicit API for real Firebase environments", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "production";
    expect(getApiBaseUrl).toThrow("Set EXPO_PUBLIC_API_BASE_URL");
  });

  it("does not silently fall back to native localhost when runtime hints are unavailable", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = false;
    expect(getApiBaseUrl).toThrow(
      "PetConnect could not determine the Expo development server address.",
    );
  });
});
