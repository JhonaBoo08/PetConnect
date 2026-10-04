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
const mockListPets = jest.fn();
const mockNearby = jest.fn();
const mockGps = jest.fn();
const mockCreate = jest.fn();
const mockReunite = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  navigate: jest.fn(),
  setParams: jest.fn(),
};
let mockParams: Record<string, string> = {};
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

jest.mock("@/components/recovery-map", () => ({
  RecoveryMap: (props: unknown) => mockRecoveryMap(props),
}));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: Error) => error.message,
}));
jest.mock("@/services/pets", () => ({ listPets: () => mockListPets() }));
jest.mock("@/services/device-recovery", () => ({
  enableRecoveryPush: jest.fn(),
  requestCurrentCoordinates: () => mockGps(),
}));
jest.mock("@/services/recovery-network", () => ({
  listMyLostReports: (...args: unknown[]) => mockListReports(...args),
  getNearbyLostReports: (...args: unknown[]) => mockNearby(...args),
  createLostReport: (...args: unknown[]) => mockCreate(...args),
  markPetReunited: (...args: unknown[]) => mockReunite(...args),
  getLostReport: (...args: unknown[]) => mockGetLostReport(...args),
  listRecoveryNotifications: (...args: unknown[]) => mockNotifications(...args),
  markRecoveryNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
}));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));
import AlertsScreen from "../alerts";
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockListPets.mockResolvedValue([{ id: "PET-MAP", name: "Milo" }]);
  mockNotifications.mockResolvedValue([]);
  mockNearby.mockResolvedValue([]);
  mockGps.mockResolvedValue({
    latitude: 7.45,
    longitude: 125.81,
    accuracyM: 15,
  });
  mockCreate.mockResolvedValue({ id: "LR-NEW", petName: "Milo" });
  mockReunite.mockResolvedValue(undefined);
  mockMarkRead.mockResolvedValue(undefined);
  mockListReports.mockResolvedValue([]);
  mockGetLostReport.mockResolvedValue({ report: null, sightings: [] });
});
it("preserves the selected recovery tab when data is refreshed", async () => {
  mockNotifications.mockResolvedValue([]);
  const view = await render(<AlertsScreen />);
  await waitFor(() => expect(mockNotifications).toHaveBeenCalled());
  await fireEvent.press(view.getByRole("tab", { name: "My Reports" }));
  await fireEvent(view.getByLabelText("Refresh recovery"), "refresh");
  await waitFor(() => expect(mockListReports).toHaveBeenCalledTimes(2));
  expect(
    view.getByRole("tab", { name: "My Reports" }).props.accessibilityState
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
  await fireEvent.press(view.getByRole("tab", { name: "My Reports" }));
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

it("defaults to Nearby and opens a focused report only on request", async () => {
  const view = await render(<AlertsScreen />);
  await waitFor(() => expect(view.getByText("Location needed")).toBeTruthy());
  expect(
    view.getByRole("tab", { name: "Nearby" }).props.accessibilityState.selected,
  ).toBe(true);
  expect(view.queryByLabelText("Go back")).toBeNull();
  expect(view.queryByLabelText("Last seen")).toBeNull();
  expect(
    view.getByRole("tab", { name: "Recovery" }).props.accessibilityState
      .selected,
  ).toBe(true);
  await fireEvent.press(view.getByRole("button", { name: "Report Lost Pet" }));
  expect(view.getByLabelText("Last seen")).toBeTruthy();
  expect(view.queryByRole("tab", { name: "Nearby" })).toBeNull();
  expect(view.queryByRole("tab", { name: "Recovery" })).toBeNull();
  await fireEvent.press(view.getByLabelText("Back to Recovery"));
  expect(view.queryByLabelText("Last seen")).toBeNull();
  expect(
    view.getByRole("tab", { name: "Nearby" }).props.accessibilityState.selected,
  ).toBe(true);
});

it("publishes a pet-specific deep link with its selected location", async () => {
  mockParams = { mode: "report", petId: "PET-MAP" };
  const view = await render(<AlertsScreen />);
  await waitFor(() => expect(view.getByLabelText("Last seen")).toBeTruthy());
  expect(
    view.getByLabelText("Select Milo for lost report").props.accessibilityState
      .selected,
  ).toBe(true);
  await fireEvent.changeText(view.getByLabelText("Last seen"), "Freedom Park");
  await fireEvent.changeText(
    view.getByLabelText("Lost pet details"),
    "Yellow collar",
  );
  await fireEvent.press(view.getByLabelText("Use my GPS"));
  await waitFor(() => expect(view.getByText(/7.45000/)).toBeTruthy());
  await fireEvent.press(
    view.getByRole("button", { name: "Publish lost report" }),
  );
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      petId: "PET-MAP",
      lastSeenText: "Freedom Park",
      details: "Yellow collar",
      latitude: 7.45,
      longitude: 125.81,
      accuracyM: 15,
    }),
  );
  await waitFor(() =>
    expect(
      view.getByRole("tab", { name: "My Reports" }).props.accessibilityState
        .selected,
    ).toBe(true),
  );
  expect(view.queryByLabelText("Last seen")).toBeNull();
});

it("offers Add a pet instead of reporting actions for an owner with no pets", async () => {
  mockListPets.mockResolvedValue([]);
  const view = await render(<AlertsScreen />);
  await waitFor(() => expect(mockListPets).toHaveBeenCalled());
  expect(view.queryByRole("button", { name: "Report Lost Pet" })).toBeNull();
  await fireEvent.press(view.getByRole("tab", { name: "My Reports" }));
  await fireEvent.press(view.getByRole("button", { name: "Add a pet" }));
  expect(mockPush).toHaveBeenCalledWith("/add-pet");
  expect(view.queryByLabelText("Last seen")).toBeNull();
});

it("keeps a reportId deep link in My Reports without opening creation", async () => {
  mockParams = { mode: "report", reportId: "LR-OLD" };
  const view = await render(<AlertsScreen />);
  await waitFor(() =>
    expect(
      view.getByRole("tab", { name: "My Reports" }).props.accessibilityState
        .selected,
    ).toBe(true),
  );
  expect(view.queryByLabelText("Last seen")).toBeNull();
});

it("redirects legacy Updates links to Notifications", async () => {
  mockParams = { mode: "updates" };
  await render(<AlertsScreen />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/notifications"),
  );
});

it("shows a retry action when the recovery API fails", async () => {
  mockListReports.mockRejectedValue(new Error("Recovery service unavailable"));
  const view = await render(<AlertsScreen />);
  await waitFor(() =>
    expect(view.getByText("Recovery service unavailable")).toBeTruthy(),
  );
  expect(view.queryByText("No active recovery cases")).toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Retry recovery" }));
  await waitFor(() => expect(mockListReports).toHaveBeenCalledTimes(2));
});

it("refreshes Nearby when returning after publishing a report", async () => {
  mockNearby.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      id: "LR-NEW",
      petName: "Milo",
      petSpecies: "Dog",
      petBreed: "Aspin",
      status: "LOST",
      lastSeenText: "Freedom Park",
      details: "",
      latitude: 7.45,
      longitude: 125.81,
      distanceKm: 0,
      reportedAt: "2026-10-04T00:00:00Z",
      lastSightedAt: null,
    },
  ]);
  const view = await render(<AlertsScreen />);
  await waitFor(() =>
    expect(view.getByRole("button", { name: "Report Lost Pet" })).toBeTruthy(),
  );
  await fireEvent.press(view.getByLabelText("Use my location"));
  await waitFor(() =>
    expect(view.getByText("No active cases nearby")).toBeTruthy(),
  );
  await fireEvent.press(view.getByRole("button", { name: "Report Lost Pet" }));
  await fireEvent.changeText(view.getByLabelText("Last seen"), "Freedom Park");
  await fireEvent.press(
    view.getByRole("button", { name: "Publish lost report" }),
  );
  await waitFor(() =>
    expect(
      view.getByRole("tab", { name: "My Reports" }).props.accessibilityState
        .selected,
    ).toBe(true),
  );
  await fireEvent.press(view.getByRole("tab", { name: "Nearby" }));
  await waitFor(() => expect(mockNearby).toHaveBeenCalledTimes(2));
  expect(view.getByText("Freedom Park · 0.0 km away")).toBeTruthy();
  expect(view.queryByText("No active cases nearby")).toBeNull();
});
