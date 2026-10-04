import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockPets = jest.fn();
const mockReminders = jest.fn();
const mockAppointments = jest.fn();
jest.mock("expo-image", () => ({ Image: require("react-native").Image }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: Error) => error.message,
  useAuth: () => ({
    state: {
      status: "ready",
      session: { role: "OWNER", displayName: "Review Owner" },
    },
  }),
}));
jest.mock("@/services/pets", () => ({
  listPets: () => mockPets(),
  petPhotoUri: (value: string) => value,
}));
jest.mock("@/services/health-clinic", () => ({
  listHealthReminders: (...args: unknown[]) => mockReminders(...args),
  listAppointments: (...args: unknown[]) => mockAppointments(...args),
}));
import DashboardScreen from "../dashboard";

beforeEach(() => {
  jest.clearAllMocks();
  mockPets.mockResolvedValue([
    {
      id: "PET-LUNA",
      name: "Luna",
      species: "Dog",
      breed: "Aspin",
      photoUrl: null,
    },
  ]);
  mockAppointments.mockResolvedValue([]);
  mockReminders.mockImplementation(async (_petId, range) => {
    const bounds = range as { from: string; to: string };
    if (
      new Date(bounds.to).getTime() - new Date(bounds.from).getTime() >
      62 * 86400000
    ) {
      throw new Error("Calendar range spans more than 62 days");
    }
    return [
      {
        id: "RM-LUNA",
        petId: "PET-LUNA",
        petName: "Luna",
        title: "Booster vaccine",
        status: "PENDING",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
    ];
  });
});

it("loads the upcoming care preview within the API's calendar bounds", async () => {
  const view = await render(<DashboardScreen />);
  await waitFor(() => expect(view.getByText("Booster vaccine")).toBeTruthy());
  expect(
    view.queryByText("Care schedule is temporarily unavailable."),
  ).toBeNull();
});

it("opens the specific reminder from its Home preview", async () => {
  mockReminders.mockResolvedValue([
    {
      id: "RM-LUNA",
      petId: "PET-LUNA",
      petName: "Luna",
      title: "Booster vaccine",
      status: "PENDING",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    },
  ]);
  const view = await render(<DashboardScreen />);
  await waitFor(() => expect(view.getByText("Booster vaccine")).toBeTruthy());
  await fireEvent.press(view.getByText("Booster vaccine"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/reminder-details",
    params: { id: "RM-LUNA" },
  });
});

it("keeps one useful add action and no pet-specific actions on an empty Home", async () => {
  mockPets.mockResolvedValue([]);
  mockReminders.mockResolvedValue([]);
  const view = await render(<DashboardScreen />);
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Add your first pet" }),
    ).toBeTruthy(),
  );
  expect(view.queryByLabelText("Go back")).toBeNull();
  expect(view.queryByRole("button", { name: "Report Lost Pet" })).toBeNull();
  expect(view.queryByText("Up next")).toBeNull();
  expect(
    view.getByRole("tab", { name: "Home" }).props.accessibilityState.selected,
  ).toBe(true);
});
