import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockMarkRead = jest.fn();
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));
jest.mock("@/services/auth-context", () => ({
  useAuth: () => ({
    state: {
      status: "ready",
      session: { role: "CLINIC", displayName: "Test Clinic" },
    },
    signOut: jest.fn(),
  }),
  authErrorMessage: (error: Error) => error.message,
}));
jest.mock("@/services/health-clinic", () => ({
  getClinic: async () => ({
    id: "CL-1",
    name: "Test Clinic",
    address: "Test address",
    phone: null,
  }),
  listClinicAppointments: async () =>
    ["Bantay", "Luna"].map((petName, index) => ({
      id: index === 0 ? "AP-BANTAY" : "AP-LUNA",
      petName,
      ownerName: "Owner",
      ownerPhone: null,
      status: "REQUESTED",
      appointmentDate: "2026-10-10T00:00:00Z",
      reason: "",
    })),
  updateClinicAppointment: jest.fn(),
}));
jest.mock("@/services/recovery-network", () => ({
  listRecoveryNotifications: async () => [
    {
      id: "N-LUNA",
      type: "APPOINTMENT_REQUESTED",
      title: "Luna appointment requested",
      body: "New owner request",
      data: { appointmentId: "AP-LUNA", petId: "PET-LUNA" },
      readAt: null,
      createdAt: "2026-10-03T00:00:00Z",
    },
  ],
  markRecoveryNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
}));
import ClinicDashboard from "../clinic-dashboard";

beforeEach(() => {
  jest.clearAllMocks();
  mockMarkRead.mockResolvedValue(undefined);
});

it("opens clinic updates and selects the intended appointment rather than the first pet", async () => {
  const view = await render(<ClinicDashboard />);
  await waitFor(() => expect(view.getByText("Bantay")).toBeTruthy());
  fireEvent.press(view.getByRole("button", { name: /Clinic updates/ }));
  await waitFor(() =>
    expect(view.getByText("Luna appointment requested")).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(
      view.getByRole("button", { name: "Open Luna appointment requested" }),
    );
  });
  await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith("N-LUNA"));
  expect(view.getByText("Luna")).toBeTruthy();
  expect(view.queryByText("Bantay")).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole("button", { name: "View all appointments" }));
  await waitFor(() => expect(view.getByText("Bantay")).toBeTruthy());
  fireEvent.press(view.getByRole("button", { name: /Clinic updates/ }));
  await waitFor(() => expect(view.getByText("Read")).toBeTruthy());
});

it("still opens the appointment when marking its update read fails", async () => {
  mockMarkRead.mockRejectedValue(new Error("Temporary read failure"));
  const view = await render(<ClinicDashboard />);
  await waitFor(() => expect(view.getByText("Bantay")).toBeTruthy());
  fireEvent.press(view.getByRole("button", { name: /Clinic updates/ }));
  await waitFor(() =>
    expect(view.getByText("Luna appointment requested")).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(
      view.getByRole("button", { name: "Open Luna appointment requested" }),
    );
  });
  await waitFor(() => expect(view.queryByText("Bantay")).toBeNull());
  expect(view.getByText("Luna")).toBeTruthy();
});
