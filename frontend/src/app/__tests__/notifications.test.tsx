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
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: Error) => error.message,
}));
jest.mock("@/services/recovery-network", () => ({
  listRecoveryNotifications: (...args: unknown[]) => mockNotifications(...args),
  markRecoveryNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));
jest.mock("@/lib/navigation", () => ({ goBack: jest.fn() }));

import NotificationsScreen from "../notifications";

beforeEach(() => {
  jest.clearAllMocks();
  mockMarkRead.mockResolvedValue(undefined);
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
])("opens the correct care target from an update with %j", async (data, target) => {
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

  const view = await render(<NotificationsScreen />);
  await waitFor(() => expect(view.getByText("Luna care update")).toBeTruthy());

  await act(async () => {
    fireEvent.press(view.getByLabelText("Open Luna care update"));
  });

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(target));
  expect(mockMarkRead).toHaveBeenCalledWith("N-LUNA");
});

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
])("opens finder evidence from a %s notification", async (type, data, target) => {
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

  const view = await render(<NotificationsScreen />);
  await waitFor(() =>
    expect(view.getByText("Bantay recovery update")).toBeTruthy(),
  );

  await act(async () => {
    fireEvent.press(view.getByLabelText("Open Bantay recovery update"));
  });

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(target));
});
