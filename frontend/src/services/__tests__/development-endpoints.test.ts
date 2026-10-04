import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: "phone-preview.exp.direct" } },
}));
jest.mock("../firebase/client", () => ({ firebaseClient: jest.fn() }));
jest.mock("firebase/auth", () => ({}));

import Constants from "expo-constants";
import { getApiBaseUrl } from "../auth";

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
  });

  it("uses the HTTPS Expo tunnel instead of phone localhost", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = true;
    expect(getApiBaseUrl()).toBe(
      "https://phone-preview.exp.direct/petconnect-api",
    );
  });

  it("uses the same Metro port for LAN development", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = true;
    Constants.expoConfig!.hostUri = "192.168.1.12:8081";
    expect(getApiBaseUrl()).toBe("http://192.168.1.12:8081/petconnect-api");
  });

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

  it("does not use development proxy routes in release exports", () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    globalThis.__DEV__ = false;
    expect(getApiBaseUrl()).toBe("http://127.0.0.1:3000");
  });
});
