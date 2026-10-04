import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockNotifications = jest.fn();
const mockMarkRead = jest.fn();
const mockEnablePush = jest.fn();
const mockGps = jest.fn();
jest.mock("@/services/device-recovery", () => ({
  enableRecoveryPush: (...args: unknown[]) => mockEnablePush(...args),
  requestCurrentCoordinates: () => mockGps(),
}));

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
  mockGps.mockResolvedValue({
    latitude: 7.45,
    longitude: 125.81,
    accuracyM: 15,
  });
  mockEnablePush.mockResolvedValue({
    enabled: true,
    token: "ExponentPushToken[test]",
  });
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

    const view = await render(<NotificationsScreen />);
    await waitFor(() =>
      expect(view.getByText("Luna care update")).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText("Open Luna care update"));
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(target));
    expect(mockMarkRead).toHaveBeenCalledWith("N-LUNA");
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
])(
  "opens finder evidence from a %s notification",
  async (type, data, target) => {
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
  },
);

it("distinguishes unread items and clears them only after successful read synchronization", async () => {
  mockNotifications.mockResolvedValue([
    {
      id: "N-NEARBY",
      type: "LOST_PET_NEARBY",
      title: "Lost pet nearby",
      body: "View local cases",
      data: { reportId: "LR-NEARBY" },
      readAt: null,
      createdAt: "2026-10-04T00:00:00Z",
    },
  ]);
  const view = await render(<NotificationsScreen />);
  await waitFor(() =>
    expect(view.getByText("1 unread notification")).toBeTruthy(),
  );
  expect(
    view.getByLabelText("Open Lost pet nearby").props.accessibilityHint,
  ).toBe("Unread notification");
  await fireEvent.press(view.getByLabelText("Open Lost pet nearby"));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/alerts",
      params: { mode: "feed" },
    }),
  );
  expect(mockMarkRead).toHaveBeenCalledWith("N-NEARBY");
  expect(view.queryByText("1 unread notification")).toBeNull();
  expect(
    view.getByLabelText("Open Lost pet nearby").props.accessibilityHint,
  ).toBe("Read notification");
});

it("opens evidence while keeping the item unread if marking it read fails", async () => {
  mockNotifications.mockResolvedValue([
    {
      id: "N-OFFLINE",
      type: "PET_SIGHTED",
      title: "Milo was sighted",
      body: "Review evidence",
      data: { reportId: "LR-MILO", sightingId: "SG-MILO" },
      readAt: null,
      createdAt: "2026-10-04T00:00:00Z",
    },
  ]);
  mockMarkRead.mockRejectedValue(new Error("Offline"));
  const view = await render(<NotificationsScreen />);
  await waitFor(() => expect(view.getByText("Milo was sighted")).toBeTruthy());
  await fireEvent.press(view.getByLabelText("Open Milo was sighted"));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/recovery-report",
      params: { reportId: "LR-MILO", sightingId: "SG-MILO" },
    }),
  );
  expect(view.getByText("1 unread notification")).toBeTruthy();
  expect(
    view.getByLabelText("Open Milo was sighted").props.accessibilityHint,
  ).toBe("Unread notification");
});

it("shows a loading failure instead of an empty inbox and supports retrying by refresh", async () => {
  mockNotifications
    .mockRejectedValueOnce(new Error("Notifications unavailable"))
    .mockResolvedValue([]);
  const view = await render(<NotificationsScreen />);
  await waitFor(() =>
    expect(view.getByText("Notifications unavailable")).toBeTruthy(),
  );
  expect(view.queryByText("You're all caught up")).toBeNull();
  await fireEvent.press(view.getByLabelText("Retry notifications"));
  await waitFor(() =>
    expect(view.getByText("You're all caught up")).toBeTruthy(),
  );
  expect(view.queryByText("Notifications unavailable")).toBeNull();
});
