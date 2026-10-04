import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNotifications = jest.fn();
const mockMarkRead = jest.fn();
const mockListReports = jest.fn();
const mockGetLostReport = jest.fn();
const mockRecoveryMap = jest.fn(() => null);
jest.mock(
  "react-native/Libraries/Components/RefreshControl/RefreshControl",
  () => ({
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      require("react").createElement(require("react-native").View, {
        ...props,
        accessible: true,
      }),
  }),
);
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
jest.mock("@/components/bottom-nav", () => ({ BottomNav: () => null }));
jest.mock("@/components/recovery-map", () => ({
  RecoveryMap: (props: unknown) => mockRecoveryMap(props),
}));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: Error) => error.message,
}));
jest.mock("@/services/pets", () => ({ listPets: async () => [] }));
jest.mock("@/services/device-recovery", () => ({
  enableRecoveryPush: jest.fn(),
  requestCurrentCoordinates: jest.fn(),
}));
jest.mock("@/services/recovery-network", () => ({
  listMyLostReports: (...args: unknown[]) => mockListReports(...args),
  getLostReport: (...args: unknown[]) => mockGetLostReport(...args),
  listRecoveryNotifications: (...args: unknown[]) => mockNotifications(...args),
  markRecoveryNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ mode: "report" }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));
import AlertsScreen from "../alerts";
beforeEach(() => {
  jest.clearAllMocks();
  mockMarkRead.mockResolvedValue(undefined);
  mockListReports.mockResolvedValue([]);
  mockGetLostReport.mockResolvedValue({ report: null, sightings: [] });
});
it("preserves the selected recovery tab when data is refreshed", async () => {
  mockNotifications.mockResolvedValue([]);
  const view = await render(<AlertsScreen />);
  await waitFor(() => expect(mockNotifications).toHaveBeenCalled());
  await fireEvent.press(view.getByRole("tab", { name: "My reports" }));
  await fireEvent(view.getByLabelText("Refresh recovery updates"), "refresh");
  await waitFor(() => expect(mockNotifications).toHaveBeenCalledTimes(2));
  expect(
    view.getByRole("tab", { name: "My reports" }).props.accessibilityState
      .selected,
  ).toBe(true);
});

it("shows the owner's original lost location and finder-found location on the recovery map", async () => {
  const report = {
    id: "LR-MAP",
    petId: "PET-MAP",
    petName: "Milo",
    petSpecies: "Dog",
    petBreed: "Aspin",
    petPhotoUrl: null,
    status: "SIGHTED",
    lastSeenText: "Freedom Park",
    details: "",
    lastSeenLatitude: 7.4478,
    lastSeenLongitude: 125.8078,
    lastKnownLatitude: 7.452,
    lastKnownLongitude: 125.813,
    lastKnownAccuracyM: 20,
    reportedAt: "2026-10-04T00:00:00Z",
    lastSightedAt: "2026-10-04T02:00:00Z",
    reunitedAt: null,
    sightingCount: 2,
  };
  mockListReports.mockResolvedValue([report]);
  mockNotifications.mockResolvedValue([]);
  mockGetLostReport.mockResolvedValue({
    report,
    sightings: [
      {
        id: "SG-LATEST",
        reportId: report.id,
        encounterType: "HAVE_PET",
        finderName: null,
        finderContact: null,
        contactShared: false,
        phoneVerified: true,
        notes: "",
        locationText: "Near the barangay hall",
        latitude: 7.452,
        longitude: 125.813,
        accuracyM: 15,
        locationSource: "GPS",
        riskState: "ACCEPTED",
        evidence: [],
        createdAt: "2026-10-04T02:00:00Z",
      },
      {
        id: "SG-BLOCKED",
        reportId: report.id,
        encounterType: "SEEN",
        finderName: null,
        finderContact: null,
        contactShared: false,
        phoneVerified: false,
        notes: "",
        locationText: "Blocked report",
        latitude: 7.449,
        longitude: 125.81,
        accuracyM: 30,
        locationSource: "GPS",
        riskState: "BLOCKED",
        evidence: [],
        createdAt: "2026-10-04T00:30:00Z",
      },
      {
        id: "SG-FIRST",
        reportId: report.id,
        encounterType: "SEEN",
        finderName: null,
        finderContact: null,
        contactShared: false,
        phoneVerified: false,
        notes: "",
        locationText: "First sighting",
        latitude: 7.4501,
        longitude: 125.8112,
        accuracyM: 20,
        locationSource: "GPS",
        riskState: "ACCEPTED",
        evidence: [],
        createdAt: "2026-10-04T01:00:00Z",
      },
    ],
  });

  const view = await render(<AlertsScreen />);
  await fireEvent.press(view.getByRole("tab", { name: "My reports" }));
  await waitFor(() =>
    expect(mockRecoveryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        pins: expect.arrayContaining([
          expect.objectContaining({ kind: "lost", title: "Milo · last seen" }),
          expect.objectContaining({
            id: "SG-FIRST",
            kind: "sighting",
          }),
          expect.objectContaining({
            id: "SG-LATEST",
            kind: "found",
            title: "Finder reported having the pet",
          }),
        ]),
        trail: [
          { latitude: 7.4478, longitude: 125.8078 },
          { latitude: 7.4501, longitude: 125.8112 },
          { latitude: 7.452, longitude: 125.813 },
        ],
      }),
    ),
  );
});
