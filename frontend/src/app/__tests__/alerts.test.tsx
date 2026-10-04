import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
const mockPush = jest.fn();
const mockNotifications = jest.fn();
const mockMarkRead = jest.fn();
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
jest.mock("@/components/recovery-map", () => ({ RecoveryMap: () => null }));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: Error) => error.message,
}));
jest.mock("@/services/pets", () => ({ listPets: async () => [] }));
jest.mock("@/services/device-recovery", () => ({
  enableRecoveryPush: jest.fn(),
  requestCurrentCoordinates: jest.fn(),
}));
jest.mock("@/services/recovery-network", () => ({
  listMyLostReports: async () => [],
  listRecoveryNotifications: (...args: unknown[]) => mockNotifications(...args),
  markRecoveryNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ mode: "updates" }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));
import AlertsScreen from "../alerts";
beforeEach(() => {
  jest.clearAllMocks();
  mockMarkRead.mockResolvedValue(undefined);
});
it("preserves the selected recovery tab when data is refreshed", async () => {
  mockNotifications.mockResolvedValue([]);
  const view = await render(<AlertsScreen />);
  await waitFor(() => expect(mockNotifications).toHaveBeenCalled());
  await fireEvent.press(view.getByRole("tab", { name: "Report lost" }));
  await fireEvent(view.getByLabelText("Refresh recovery updates"), "refresh");
  await waitFor(() => expect(mockNotifications).toHaveBeenCalledTimes(2));
  expect(
    view.getByRole("tab", { name: "Report lost" }).props.accessibilityState
      .selected,
  ).toBe(true);
});
it.each([
  [
    { reminderId: "RM-LUNA" },
    { pathname: "/reminder-details", params: { id: "RM-LUNA" } },
  ],
  [
    { appointmentId: "AP-LUNA", petId: "PET-LUNA" },
    { pathname: "/health-reminders", params: { petId: "PET-LUNA" } },
  ],
  [
    { healthRecordId: "HR-LUNA", petId: "PET-LUNA" },
    { pathname: "/health-reminders", params: { petId: "PET-LUNA" } },
  ],
])(
  "opens the correct care target from an update with %j",
  async (data, target) => {
    mockNotifications.mockResolvedValue([
      {
        id: "N-LUNA",
        type: "HEALTH_UPDATE",
        title: "Luna care update",
        body: "Open care",
        data,
        readAt: null,
        createdAt: "2026-10-03T00:00:00Z",
      },
    ]);
    const view = await render(<AlertsScreen />);
    await waitFor(() =>
      expect(view.getByText("Luna care update")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(view.getByText("Luna care update"));
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(target));
  },
);

it.each([
  [
    "PET_SIGHTED",
    { reportId: "LR-BANTAY", sightingId: "SG-BANTAY" },
    {
      pathname: "/recovery-report",
      params: { reportId: "LR-BANTAY", sightingId: "SG-BANTAY" },
    },
  ],
  [
    "PET_FOUND",
    { reportId: "LR-BANTAY", sightingId: "SG-FOUND" },
    {
      pathname: "/recovery-report",
      params: { reportId: "LR-BANTAY", sightingId: "SG-FOUND" },
    },
  ],
  [
    "PET_QR_FOUND",
    { recoveryContactEventId: "RC-BANTAY" },
    {
      pathname: "/recovery-report",
      params: { eventId: "RC-BANTAY" },
    },
  ],
])("opens finder evidence from a %s update", async (type, data, target) => {
  mockNotifications.mockResolvedValue([
    {
      id: "N-FINDER",
      type,
      title: "Bantay recovery update",
      body: "Review finder evidence",
      data,
      readAt: null,
      createdAt: "2026-10-04T00:00:00Z",
    },
  ]);
  const view = await render(<AlertsScreen />);
  await waitFor(() =>
    expect(view.getByText("Bantay recovery update")).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(view.getByText("Bantay recovery update"));
  });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(target));
});
