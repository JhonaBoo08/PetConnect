import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: "https://phone-preview.exp.direct" } },
}));
jest.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
jest.mock("firebase/auth", () => ({ connectAuthEmulator: jest.fn() }));
jest.mock("../firebase/persistence", () => ({
  persistentAuth: () => ({ emulatorConfig: null }),
}));

describe("Firebase emulator development connection", () => {
  const previousHost = process.env.EXPO_PUBLIC_EMULATOR_HOST;
  const previousEnvironment = process.env.EXPO_PUBLIC_FIREBASE_ENV;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_EMULATOR_HOST;
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
  });
  afterEach(() => {
    if (previousHost === undefined)
      delete process.env.EXPO_PUBLIC_EMULATOR_HOST;
    else process.env.EXPO_PUBLIC_EMULATOR_HOST = previousHost;
    if (previousEnvironment === undefined)
      delete process.env.EXPO_PUBLIC_FIREBASE_ENV;
    else process.env.EXPO_PUBLIC_FIREBASE_ENV = previousEnvironment;
  });

  it("connects to the Expo tunnel origin for email/password and token refresh", () => {
    const { firebaseClient } = require("../firebase/client");
    const { connectAuthEmulator } = require("firebase/auth");
    firebaseClient();
    expect(connectAuthEmulator).toHaveBeenCalledWith(
      expect.anything(),
      "https://phone-preview.exp.direct",
      { disableWarnings: true },
    );
  });

  it("keeps an explicitly selected emulator host", () => {
    process.env.EXPO_PUBLIC_EMULATOR_HOST = "10.0.2.2";
    const { firebaseClient } = require("../firebase/client");
    const { connectAuthEmulator } = require("firebase/auth");
    firebaseClient();
    expect(connectAuthEmulator).toHaveBeenCalledWith(
      expect.anything(),
      "http://10.0.2.2:9099",
      { disableWarnings: true },
    );
  });
});
