import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("firebase/auth", () => ({
  onIdTokenChanged: jest.fn(() => jest.fn()),
}));

jest.mock("../firebase/client", () => ({
  firebaseClient: () => ({ auth: { currentUser: null } }),
}));

jest.mock("../auth", () => ({
  ApiError: class ApiError extends Error {},
  authenticatedFetch: jest.fn(),
  getApiBaseUrl: () => "http://127.0.0.1:3000",
  currentSession: jest.fn(),
  completeOwnerRegistration: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  registerOwner: jest.fn(),
}));

import { authErrorMessage } from "../auth-context";

function firebaseError(code: string) {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

describe("authErrorMessage", () => {
  const previousEnv = process.env.EXPO_PUBLIC_FIREBASE_ENV;
  const previousHost = process.env.EXPO_PUBLIC_EMULATOR_HOST;

  afterEach(() => {
    process.env.EXPO_PUBLIC_FIREBASE_ENV = previousEnv;
    process.env.EXPO_PUBLIC_EMULATOR_HOST = previousHost;
  });

  it("keeps credential failures indistinguishable from one another", () => {
    for (const code of [
      "auth/invalid-credential",
      "auth/invalid-login-credentials",
      "auth/wrong-password",
      "auth/user-not-found",
    ]) {
      expect(authErrorMessage(firebaseError(code))).toBe(
        "Incorrect email or password.",
      );
    }
  });

  it("separates configuration errors from connectivity errors", () => {
    const invalidApiKey = authErrorMessage(
      firebaseError("auth/invalid-api-key"),
    );
    const notAllowed = authErrorMessage(
      firebaseError("auth/operation-not-allowed"),
    );
    const notConfigured = authErrorMessage(
      firebaseError("auth/configuration-not-found"),
    );
    const timeout = authErrorMessage(firebaseError("auth/timeout"));

    expect(invalidApiKey).not.toBe(notAllowed);
    expect(notAllowed).not.toBe(notConfigured);
    expect(timeout).not.toBe(invalidApiKey);
    expect(invalidApiKey).toMatch(/API key/i);
    expect(notAllowed).toMatch(/Email\/Password/i);
    expect(timeout).toMatch(/time/i);
  });

  it("names the exact emulator address that failed to respond", () => {
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    process.env.EXPO_PUBLIC_EMULATOR_HOST = "192.168.0.26";
    const message = authErrorMessage(
      firebaseError("auth/network-request-failed"),
    );

    expect(message).toContain("http://192.168.0.26:9099");
    expect(message).toContain("npm run emulators");
    expect(message).not.toBe(
      "Cannot reach Firebase Auth. Check your connection or local emulator.",
    );
  });

  it("mentions 10.0.2.2 guidance for Android emulator hosts", () => {
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    process.env.EXPO_PUBLIC_EMULATOR_HOST = "10.0.2.2";
    expect(
      authErrorMessage(firebaseError("auth/network-request-failed")),
    ).toContain("10.0.2.2");
  });

  it("surfaces unrecognised auth codes instead of a generic message", () => {
    expect(authErrorMessage(firebaseError("auth/some-future-error"))).toBe(
      "Firebase Auth error: auth/some-future-error",
    );
  });
});
