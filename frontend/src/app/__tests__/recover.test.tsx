import React from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetPublicRecovery = jest.fn();
const mockEnsureFinderSession = jest.fn();
const mockSubmitFinderReport = jest.fn();
const mockUploadFinderPhoto = jest.fn();
const mockSendFinderOtp = jest.fn();
const mockVerifyFinderOtp = jest.fn();
const mockLocate = jest.fn();
const mockCameraPermission = jest.fn();
const mockLaunchCamera = jest.fn();
const mockLaunchLibrary = jest.fn();

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
jest.mock("@/components/recovery-map", () => ({
  RecoveryMap: () => null,
}));
jest.mock("expo-image", () => ({
  Image: (props: Record<string, unknown>) =>
    require("react").createElement(require("react-native").View, props),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: (...args: unknown[]) =>
    mockCameraPermission(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ token: "recovery-token" }),
}));
jest.mock("@/lib/navigation", () => ({ goBack: jest.fn() }));
jest.mock("@/services/auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: Error & { status?: number }) =>
    (error.status || 0) >= 500
      ? "The account service is unavailable. Please try again."
      : error.message,
}));
jest.mock("@/services/recovery", () => ({
  getPublicRecovery: (...args: unknown[]) => mockGetPublicRecovery(...args),
}));
jest.mock("@/services/finder-recovery", () => ({
  ensureFinderSession: (...args: unknown[]) => mockEnsureFinderSession(...args),
  newFinderIdempotencyKey: () => "finder-test-idempotency",
  submitFinderReport: (...args: unknown[]) => mockSubmitFinderReport(...args),
  uploadFinderPhoto: (...args: unknown[]) => mockUploadFinderPhoto(...args),
  sendFinderOtp: (...args: unknown[]) => mockSendFinderOtp(...args),
  verifyFinderOtp: (...args: unknown[]) => mockVerifyFinderOtp(...args),
}));
jest.mock("@/services/device-recovery", () => ({
  requestCurrentCoordinates: (...args: unknown[]) => mockLocate(...args),
}));
jest.mock("@/services/pets", () => ({
  petPhotoUri: (value: string | null) => value,
}));

import RecoverScreen from "../recover";

it("keeps a recoverable finder report after a temporary service failure", async () => {
  mockGetPublicRecovery.mockResolvedValue(lostProfile);
  const { ApiError } = require("@/services/auth") as {
    ApiError: new (message: string, status: number, code?: string) => Error;
  };
  mockSubmitFinderReport.mockRejectedValueOnce(
    new ApiError("Internal service failure", 503),
  );
  const view = await render(<RecoverScreen />);
  await waitFor(() => expect(view.getByText("LOST PET")).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "I saw this pet" }));
  await waitFor(() =>
    expect(view.getByLabelText("Finder location description")).toBeTruthy(),
  );
  await fireEvent.changeText(
    view.getByLabelText("Finder location description"),
    "Market entrance",
  );
  await waitFor(() =>
    expect(view.getByLabelText("Finder location description").props.value).toBe(
      "Market entrance",
    ),
  );
  await fireEvent.press(view.getByRole("button", { name: "Send sighting" }));
  await waitFor(() =>
    expect(
      view.getByText(
        "Pet recovery is temporarily unavailable. Please try again.",
      ),
    ).toBeTruthy(),
  );
  expect(view.getByLabelText("Finder location description").props.value).toBe(
    "Market entrance",
  );
  expect(view.getByRole("button", { name: "Send sighting" })).toBeTruthy();
  await view.unmount();
});

const baseProfile = {
  pet: {
    name: "Bantay",
    species: "Dog",
    breed: "Aspin",
    sex: "Male" as const,
    ageLabel: "3 years",
    identifyingDetails: "Brown coat, white chest",
    photoUrl: null,
  },
  owner: {
    displayName: "Bantay Owner",
    phone: null,
  },
  activeReport: null,
};

const lostProfile = {
  ...baseProfile,
  activeReport: {
    status: "LOST" as const,
    lastSeenText: "Freedom Park",
    details: "Green collar",
    latitude: 7.448,
    longitude: 125.808,
    accuracyM: 150,
    reportedAt: "2026-10-04T00:00:00Z",
    lastSightedAt: null,
    sightingCount: 0,
  },
};

afterEach(() => cleanup());

beforeEach(() => {
  // Reset queued/rejected async implementations as well as call history so
  // one finder scenario cannot leak into the next recovery-screen test.
  jest.resetAllMocks();
  mockEnsureFinderSession.mockResolvedValue({
    credential: "finder-session",
    expiresAt: "2026-11-03T00:00:00Z",
    phoneVerified: false,
    verificationRequired: false,
  });
  mockCameraPermission.mockResolvedValue({ granted: true });
  mockLaunchCamera.mockResolvedValue({ canceled: true, assets: [] });
  mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: [] });
  mockLocate.mockResolvedValue({
    latitude: 7.448,
    longitude: 125.808,
    accuracyM: 10,
  });
});

it("loads a registered Pet ID without authentication and offers a private found-pet action", async () => {
  mockGetPublicRecovery.mockResolvedValue(baseProfile);
  const view = await render(<RecoverScreen />);

  await waitFor(() =>
    expect(view.getByText("This Pet ID is active")).toBeTruthy(),
  );
  expect(view.getByText("REGISTERED PET")).toBeTruthy();
  expect(view.getByRole("button", { name: "I found this pet" })).toBeTruthy();
  expect(
    view.getByText(/No PetConnect account or app is required/),
  ).toBeTruthy();
  expect(mockEnsureFinderSession).toHaveBeenCalled();
  await view.unmount();
});

it("keeps manual location available when browser GPS is denied", async () => {
  mockGetPublicRecovery.mockResolvedValue(lostProfile);
  mockLocate.mockImplementation(() => {
    throw new Error("permission denied");
  });

  const view = await render(<RecoverScreen />);
  await waitFor(() => expect(view.getByText("LOST PET")).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "I saw this pet" }));
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Use my current GPS" }),
    ).toBeTruthy(),
  );

  await fireEvent.press(
    view.getByRole("button", { name: "Use my current GPS" }),
  );

  await waitFor(() =>
    expect(
      view.getByText(/type a nearby street, landmark, or area/i),
    ).toBeTruthy(),
  );
  expect(view.getByLabelText("Finder location description")).toBeTruthy();
  await view.unmount();
});

it("keeps the SEEN flow fast and makes photo evidence optional", async () => {
  mockGetPublicRecovery.mockResolvedValue(lostProfile);

  const view = await render(<RecoverScreen />);
  await waitFor(() => expect(view.getByText("LOST PET")).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "I saw this pet" }));

  await waitFor(() =>
    expect(view.getByLabelText("Finder location description")).toBeTruthy(),
  );
  expect(view.getByText(/PHOTO.*OPTIONAL/i)).toBeTruthy();
  expect(view.getByRole("button", { name: "Send sighting" })).toBeTruthy();
  expect(mockUploadFinderPhoto).not.toHaveBeenCalled();
  expect(mockSubmitFinderReport).not.toHaveBeenCalled();
  await view.unmount();
});

it("requires a current photo when the finder says they have the pet", async () => {
  mockGetPublicRecovery.mockResolvedValue(lostProfile);
  const view = await render(<RecoverScreen />);
  await waitFor(() => expect(view.getByText("LOST PET")).toBeTruthy());

  await fireEvent.press(view.getByRole("button", { name: "I have this pet" }));
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Take a current photo" }),
    ).toBeTruthy(),
  );
  await fireEvent.changeText(
    view.getByLabelText("Finder location description"),
    "Guardhouse",
  );
  await waitFor(() =>
    expect(view.getByLabelText("Finder location description").props.value).toBe(
      "Guardhouse",
    ),
  );
  await fireEvent.press(
    view.getByRole("button", { name: "Send found-pet report" }),
  );

  await waitFor(() =>
    expect(view.getByText(/Add a current photo of Bantay/i)).toBeTruthy(),
  );
  expect(mockSubmitFinderReport).not.toHaveBeenCalled();
  await view.unmount();
});

it("captures current photo evidence for a HAVE_PET report", async () => {
  mockGetPublicRecovery.mockResolvedValue(lostProfile);
  mockLaunchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///finder-bantay.jpg" }],
  });

  const view = await render(<RecoverScreen />);
  await waitFor(() => expect(view.getByText("LOST PET")).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "I have this pet" }));
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Take a current photo" }),
    ).toBeTruthy(),
  );

  await fireEvent.press(
    view.getByRole("button", { name: "Take a current photo" }),
  );
  await waitFor(() => expect(mockLaunchCamera).toHaveBeenCalled());
  await waitFor(() =>
    expect(view.getByRole("button", { name: "Retake" })).toBeTruthy(),
  );
  expect(mockUploadFinderPhoto).not.toHaveBeenCalled();
  expect(mockSubmitFinderReport).not.toHaveBeenCalled();
  await view.unmount();
});

it("progressively requests phone verification only when the API requires it", async () => {
  mockGetPublicRecovery.mockResolvedValue(lostProfile);
  const { ApiError } = require("@/services/auth") as {
    ApiError: new (message: string, status: number, code?: string) => Error;
  };
  mockSubmitFinderReport.mockRejectedValueOnce(
    new ApiError(
      "Verify a phone number before sending more finder reports.",
      428,
      "phone-verification-required",
    ),
  );
  // Keep the OTP request pending after the network call is observed. This
  // isolates the UI trigger from provider-specific delivery, which is covered
  // by backend verification tests.
  mockSendFinderOtp.mockReturnValue(new Promise(() => {}));

  const view = await render(<RecoverScreen />);
  await waitFor(() => expect(view.getByText("LOST PET")).toBeTruthy());
  await fireEvent.press(view.getByRole("button", { name: "I saw this pet" }));
  await waitFor(() =>
    expect(view.getByLabelText("Finder location description")).toBeTruthy(),
  );
  await fireEvent.changeText(
    view.getByLabelText("Finder location description"),
    "Public market",
  );
  await waitFor(() =>
    expect(view.getByLabelText("Finder location description").props.value).toBe(
      "Public market",
    ),
  );

  await fireEvent.press(view.getByRole("button", { name: "Send sighting" }));
  await waitFor(() =>
    expect(view.getByText("Extra verification needed")).toBeTruthy(),
  );
  expect(
    view.getByText(/Verification does not automatically share your number/i),
  ).toBeTruthy();

  await fireEvent.changeText(
    view.getByLabelText("Verification phone number"),
    "09171234567",
  );
  await waitFor(() =>
    expect(view.getByLabelText("Verification phone number").props.value).toBe(
      "09171234567",
    ),
  );
  await fireEvent.press(
    view.getByRole("button", { name: "Send verification code" }),
  );
  await waitFor(() =>
    expect(mockSendFinderOtp).toHaveBeenCalledWith("09171234567"),
  );
  expect(mockVerifyFinderOtp).not.toHaveBeenCalled();
  await view.unmount();
});
