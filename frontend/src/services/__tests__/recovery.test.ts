import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockDevelopmentServerOrigin = jest.fn<() => string | undefined>(
  () => "https://pitch-demo.exp.direct",
);

jest.mock("../auth", () => ({
  ApiError: class ApiError extends Error {},
  authenticatedFetch: jest.fn(),
  getApiBaseUrl: () => "http://127.0.0.1:3000",
}));
jest.mock("../development-endpoints", () => ({
  developmentServerOrigin: () => mockDevelopmentServerOrigin(),
}));

import {
  recoveryTokenFromQrData,
  recoveryUrlForCurrentRuntime,
} from "../recovery";

const token = `${"a".repeat(32)}.${"B".repeat(43)}`;

describe("recoveryUrlForCurrentRuntime", () => {
  const previousEnvironment = process.env.EXPO_PUBLIC_FIREBASE_ENV;

  afterEach(() => {
    if (previousEnvironment === undefined) {
      delete process.env.EXPO_PUBLIC_FIREBASE_ENV;
    } else {
      process.env.EXPO_PUBLIC_FIREBASE_ENV = previousEnvironment;
    }
    mockDevelopmentServerOrigin.mockReset();
    mockDevelopmentServerOrigin.mockReturnValue(
      "https://pitch-demo.exp.direct",
    );
  });

  it("rewrites localhost recovery links to the active Expo development origin", () => {
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "emulator";
    expect(
      recoveryUrlForCurrentRuntime(
        `http://localhost:8081/recover?token=${encodeURIComponent(token)}`,
      ),
    ).toBe(
      `https://pitch-demo.exp.direct/recover?token=${encodeURIComponent(token)}`,
    );
  });

  it("preserves the configured production recovery origin", () => {
    process.env.EXPO_PUBLIC_FIREBASE_ENV = "production";
    const recoveryUrl = `https://pets.example/recover?token=${encodeURIComponent(token)}`;
    expect(recoveryUrlForCurrentRuntime(recoveryUrl)).toBe(recoveryUrl);
  });
});

describe("recoveryTokenFromQrData", () => {
  it("accepts a raw signed Pet ID token", () => {
    expect(recoveryTokenFromQrData(token)).toBe(token);
  });

  it("extracts a token from a PetConnect recovery URL", () => {
    expect(
      recoveryTokenFromQrData(
        `https://petconnect.example/recover?token=${encodeURIComponent(token)}`,
      ),
    ).toBe(token);
  });

  it("rejects malformed, unsigned, arbitrary-URL, and unrelated QR content", () => {
    expect(recoveryTokenFromQrData("hello")).toBeNull();
    expect(recoveryTokenFromQrData("https://example.com/anything")).toBeNull();
    expect(recoveryTokenFromQrData("a".repeat(32))).toBeNull();
    expect(
      recoveryTokenFromQrData("https://petconnect.example/recover?token=bad"),
    ).toBeNull();
  });
});
