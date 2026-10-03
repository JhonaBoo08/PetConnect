import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../auth", () => ({
  ApiError: class ApiError extends Error {},
  authenticatedFetch: jest.fn(),
  getApiBaseUrl: () => "http://127.0.0.1:3000",
}));

import { recoveryTokenFromQrData } from "../recovery";

const token = `${"a".repeat(32)}.${"B".repeat(43)}`;

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
