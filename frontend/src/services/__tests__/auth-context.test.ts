import { describe, expect, it, jest } from "@jest/globals";

jest.mock("firebase/auth", () => ({
  onIdTokenChanged: jest.fn(() => jest.fn()),
}));

jest.mock("../firebase/client", () => ({
  firebaseClient: () => ({ auth: { currentUser: null } }),
}));

jest.mock("../auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  authenticatedFetch: jest.fn(),
  getApiBaseUrl: () => "http://127.0.0.1:3000",
  currentSession: jest.fn(),
  completeOwnerRegistration: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  registerOwner: jest.fn(),
}));

import { ApiError } from "../auth";
import { authErrorMessage } from "../auth-context";

function firebaseError(code: string) {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

describe("authErrorMessage", () => {
  it("keeps local service details out of user-facing errors", () => {
    const message = authErrorMessage(
      new ApiError(
        "Start the PetConnect API with npm --prefix backend/api run dev.",
        502,
        "development-service-unavailable",
      ),
    );

    expect(message).toBe(
      "PetConnect is temporarily unavailable. Please try again in a moment.",
    );
    expect(message).not.toMatch(/npm|127\.0\.0\.1|port|firebase|api/i);
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

  it("does not expose Firebase configuration details to users", () => {
    for (const code of [
      "auth/invalid-api-key",
      "auth/api-key-not-supported",
      "auth/app-not-found",
      "auth/configuration-not-found",
      "auth/operation-not-allowed",
      "auth/unauthorized-domain",
      "auth/project-not-found",
      "auth/emulator-config-failed",
    ]) {
      const message = authErrorMessage(firebaseError(code));
      expect(message).toBe(
        "PetConnect sign-in is temporarily unavailable. Please try again later.",
      );
      expect(message).not.toMatch(/firebase|api key|emulator|project|domain/i);
    }
  });

  it("keeps transport failures generic and user-safe", () => {
    for (const code of ["auth/timeout", "auth/network-request-failed"]) {
      const message = authErrorMessage(firebaseError(code));
      expect(message).toBe(
        "PetConnect is temporarily unavailable. Please try again in a moment.",
      );
      expect(message).not.toMatch(/localhost|127\.0\.0\.1|9099|npm|emulator/i);
    }
  });

  it("does not surface unknown Firebase error codes", () => {
    const message = authErrorMessage(firebaseError("auth/some-future-error"));
    expect(message).toBe(
      "We could not complete that request. Please try again.",
    );
    expect(message).not.toContain("auth/some-future-error");
  });

  it("sanitizes internal configuration details from generic errors", () => {
    const message = authErrorMessage(
      new Error(
        "Firebase configuration is incomplete. Check frontend/.env.local and EXPO_PUBLIC_FIREBASE_API_KEY.",
      ),
    );
    expect(message).toBe(
      "PetConnect is temporarily unavailable. Please try again in a moment.",
    );
    expect(message).not.toMatch(/firebase|env|api key|expo_public/i);
  });
});
