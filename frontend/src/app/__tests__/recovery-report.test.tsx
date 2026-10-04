import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string> = {};
const mockGetLostReport = jest.fn();
const mockGetRecoveryContactEvent = jest.fn();
const mockReportSightingAbuse = jest.fn();
const mockReportContactAbuse = jest.fn();
const mockMarkReunited = jest.fn();
const mockReplace = jest.fn();

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
jest.mock("@/components/recovery-map", () => ({
  RecoveryMap: () =>
    require("react").createElement(require("react-native").View),
}));
jest.mock("expo-image", () => ({
  Image: (props: Record<string, unknown>) =>
    require("react").createElement(require("react-native").View, props),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/lib/navigation", () => ({ goBack: jest.fn() }));
jest.mock("@/services/auth", () => ({
  getApiBaseUrl: () => "http://localhost:3000",
}));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: Error) => error.message,
}));
jest.mock("@/services/firebase/client", () => ({
  firebaseClient: () => ({
    auth: {
      currentUser: {
        getIdToken: async () => "owner-token",
      },
    },
  }),
}));
jest.mock("@/services/recovery-network", () => ({
  getLostReport: (...args: unknown[]) => mockGetLostReport(...args),
  getRecoveryContactEvent: (...args: unknown[]) =>
    mockGetRecoveryContactEvent(...args),
  reportFinderSightingAbuse: (...args: unknown[]) =>
    mockReportSightingAbuse(...args),
  reportRecoveryContactAbuse: (...args: unknown[]) =>
    mockReportContactAbuse(...args),
  markPetReunited: (...args: unknown[]) => mockMarkReunited(...args),
}));

import RecoveryReportScreen from "../recovery-report";

const evidence = [
  {
    id: "EV-BANTAY",
    url: "/v1/finder-evidence/EV-BANTAY/file",
    mimeType: "image/webp",
    byteSize: 2048,
    width: 640,
    height: 480,
    createdAt: "2026-10-04T00:01:00Z",
  },
];

const sighting = {
  id: "SG-BANTAY",
  reportId: "LR-BANTAY",
  encounterType: "HAVE_PET" as const,
  finderName: "Helpful Finder",
  finderContact: "+639171234567",
  contactShared: true,
  phoneVerified: true,
  notes: "Bantay is safe at the guardhouse.",
  locationText: "Main guardhouse",
  latitude: 7.448,
  longitude: 125.808,
  accuracyM: 8,
  locationSource: "GPS" as const,
  riskState: "ACCEPTED" as const,
  evidence,
  createdAt: "2026-10-04T00:02:00Z",
};

const report = {
  id: "LR-BANTAY",
  petId: "PET-BANTAY",
  petName: "Bantay",
  petSpecies: "Dog",
  petBreed: "Aspin",
  petPhotoUrl: null,
  status: "SIGHTED" as const,
  lastSeenText: "Freedom Park",
  details: "",
  lastSeenLatitude: 7.447,
  lastSeenLongitude: 125.807,
  lastKnownLatitude: 7.448,
  lastKnownLongitude: 125.808,
  lastKnownAccuracyM: 8,
  reportedAt: "2026-10-04T00:00:00Z",
  lastSightedAt: "2026-10-04T00:02:00Z",
  reunitedAt: null,
  sightingCount: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { reportId: "LR-BANTAY", sightingId: "SG-BANTAY" };
  mockGetLostReport.mockResolvedValue({ report, sightings: [sighting] });
  mockGetRecoveryContactEvent.mockResolvedValue(null);
  mockReportSightingAbuse.mockResolvedValue(undefined);
  mockReportContactAbuse.mockResolvedValue(undefined);
  mockMarkReunited.mockResolvedValue({ ...report, status: "REUNITED" });
});

it("shows owner-only finder evidence and explicit trust badges", async () => {
  const view = await render(<RecoveryReportScreen />);

  await waitFor(() => expect(view.getByText("Finder report")).toBeTruthy());
  await waitFor(() => expect(view.getByText("Bantay")).toBeTruthy());
  expect(view.getByText("HAS PET")).toBeTruthy();
  expect(view.getByText("Photo attached")).toBeTruthy();
  expect(view.getByText("GPS shared")).toBeTruthy();
  expect(view.getByText("Phone verified")).toBeTruthy();
  expect(view.getByText("Contact shared")).toBeTruthy();
  expect(view.getByText("Helpful Finder")).toBeTruthy();
  expect(view.getByText("Bantay is safe at the guardhouse.")).toBeTruthy();
  expect(view.getByText("+639171234567")).toBeTruthy();
  expect(
    view.getByText(/does not show the finder session identifier/i),
  ).toBeTruthy();
});

it("lets the owner flag a finder sighting and uses a confirmation before reunion", async () => {
  const view = await render(<RecoveryReportScreen />);
  await waitFor(() => expect(view.getByText("Bantay")).toBeTruthy());

  await act(async () => {
    fireEvent.press(
      view.getByRole("button", { name: "Report this finder submission" }),
    );
  });
  await waitFor(() =>
    expect(mockReportSightingAbuse).toHaveBeenCalledWith(
      "LR-BANTAY",
      "SG-BANTAY",
    ),
  );

  fireEvent.press(
    view.getByRole("button", { name: "I confirmed my pet is reunited" }),
  );
  await waitFor(() =>
    expect(view.getByText("Confirm Bantay is reunited?")).toBeTruthy(),
  );
  expect(mockMarkReunited).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(view.getByRole("button", { name: "Mark reunited" }));
  });
  await waitFor(() =>
    expect(mockMarkReunited).toHaveBeenCalledWith("LR-BANTAY"),
  );
});

it("opens non-lost QR finder contacts without inventing a lost report", async () => {
  mockParams = { eventId: "RC-BANTAY" };
  mockGetRecoveryContactEvent.mockResolvedValue({
    id: "RC-BANTAY",
    petName: "Bantay",
    encounterType: "HAVE_PET",
    finderName: null,
    finderContact: null,
    contactShared: false,
    phoneVerified: true,
    notes: "Found near the school.",
    locationText: "School gate",
    latitude: null,
    longitude: null,
    accuracyM: null,
    locationSource: "TEXT",
    riskState: "REVIEW",
    evidence,
    createdAt: "2026-10-04T00:02:00Z",
  });

  const view = await render(<RecoveryReportScreen />);
  await waitFor(() =>
    expect(mockGetRecoveryContactEvent).toHaveBeenCalledWith("RC-BANTAY"),
  );
  expect(mockGetLostReport).not.toHaveBeenCalled();
  expect(
    view.getByText("Unverified report — review the details carefully."),
  ).toBeTruthy();
  expect(
    view.getByText("Verified privately, not shared with you"),
  ).toBeTruthy();

  await act(async () => {
    fireEvent.press(
      view.getByRole("button", { name: "Report this finder submission" }),
    );
  });
  await waitFor(() =>
    expect(mockReportContactAbuse).toHaveBeenCalledWith("RC-BANTAY"),
  );
});
