import React from "react";
import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type {
  Appointment,
  HealthReminder,
  Pet,
} from "../../../../shared/contracts";
import { careDayLabel, monthRange } from "../../lib/care-calendar";

// Allow native component modules to load during the first render on cold CI runs.
jest.setTimeout(20000);

const mockListReminders = jest.fn();
const mockListAppointments = jest.fn();
const mockCreateReminder = jest.fn();
const mockPush = jest.fn();
let mockStoredReminders: HealthReminder[] = [];
jest.mock("expo-font", () => ({ useFonts: () => [true, null] }));
jest.mock("expo-image", () => ({ Image: require("react-native").Image }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    require("react").useEffect(() => callback(), [callback]);
  },
}));
jest.mock("@/services/auth-context", () => ({
  authErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "error",
}));
jest.mock("@/services/pets", () => ({
  petPhotoUri: (value: string) => "http://localhost:3000" + value,
}));
jest.mock("@/services/health-clinic", () => ({
  listHealthReminders: (...args: unknown[]) => mockListReminders(...args),
  listAppointments: (...args: unknown[]) => mockListAppointments(...args),
  createHealthReminder: (...args: unknown[]) => mockCreateReminder(...args),
}));
import { OwnerCareCalendar } from "../owner-care-calendar";

const at = new Date(2026, 9, 3, 9).toISOString();
const pets = [
  { id: "a", name: "Cooper", photoUrl: null },
  { id: "b", name: "Luna", photoUrl: null },
] as Pet[];
const entry = (id: string, petId = "a"): HealthReminder => ({
  id,
  petId,
  petName: petId === "a" ? "Cooper" : "Luna",
  title: id,
  dueAt: at,
  notifyAt: at,
  notes: "Bring vaccination booklet",
  clinic: {
    id: "clinic",
    name: "Tagum Vet",
    address: "Tagum City",
    phone: "09123456789",
  },
  sourceType: "MANUAL",
  sourceId: null,
  status: "PENDING",
  completedAt: null,
  createdAt: at,
});
const visit: Appointment = {
  id: "visit",
  petId: "a",
  petName: "Cooper",
  petSpecies: "Dog",
  petBreed: "",
  petPhotoUrl: null,
  clinic: {
    id: "clinic",
    name: "Tagum Vet",
    address: "Tagum City",
    phone: "09123456789",
  },
  ownerName: "Owner",
  ownerPhone: null,
  vetName: "Dr. Vet",
  appointmentDate: at,
  status: "SCHEDULED",
  reason: "Annual checkup",
  reminderMinutesBefore: 60,
  createdAt: at,
  updatedAt: at,
};
const dateLabel = (count: number) =>
  careDayLabel(new Date(2026, 9, 3)) +
  ", " +
  count +
  (count === 1 ? " care item" : " care items");

describe("OwnerCareCalendar", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: [
        "nextTick",
        "queueMicrotask",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "performance",
      ],
    });
    jest.setSystemTime(new Date(2026, 9, 1, 8));
    jest.clearAllMocks();
    mockStoredReminders = [];
    mockListReminders.mockImplementation(async () => mockStoredReminders);
    mockListAppointments.mockResolvedValue([]);
    mockCreateReminder.mockImplementation(
      async (input: { petId: string; title: string; dueAt: string }) => {
        const saved = { ...entry("saved", input.petId), ...input };
        mockStoredReminders = [...mockStoredReminders, saved];
        return saved;
      },
    );
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads the visible range and opens all backend schedule details for a selected date", async () => {
    mockStoredReminders = [entry("Booster"), entry("Medication", "b")];
    mockListAppointments.mockResolvedValue([visit]);
    const view = await render(<OwnerCareCalendar pets={pets} />);
    await waitFor(() => {
      expect(view.getByLabelText(dateLabel(3))).toBeTruthy();
      expect(view.queryByText("Loading care schedules…")).toBeNull();
    });
    expect(mockListReminders).toHaveBeenCalledWith(
      undefined,
      monthRange(new Date(2026, 9, 1)),
    );
    await act(async () => {
      await fireEvent.press(view.getByLabelText(dateLabel(3)));
    });
    expect(view.getByText("Booster")).toBeTruthy();
    expect(view.getByText("Medication")).toBeTruthy();
    expect(view.getAllByText("Annual checkup").length).toBeGreaterThan(0);
    expect(view.getByText("Dr. Vet")).toBeTruthy();
    expect(view.getAllByText("Tagum City")).toHaveLength(3);
    expect(mockCreateReminder).not.toHaveBeenCalled();
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Close care sheet"));
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Show care for Luna"));
    });
    expect(view.getByLabelText(dateLabel(1))).toBeTruthy();
  });

  it("saves the chosen pet and exact date/time, then shows the confirmed reminder", async () => {
    const view = await render(<OwnerCareCalendar pets={pets} />);
    await waitFor(() =>
      expect(view.queryByText("Loading care schedules…")).toBeNull(),
    );
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Show care for Luna"));
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Add a reminder"));
    });
    await act(async () => {
      await fireEvent.changeText(view.getByLabelText("Reminder"), "Vet visit");
      await fireEvent.changeText(view.getByLabelText("Date"), "10/03/2026");
      await fireEvent.changeText(view.getByLabelText("Time"), "09:30 AM");
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Save reminder"));
    });
    await waitFor(() => expect(view.getByText("Vet visit")).toBeTruthy());
    expect(mockCreateReminder).toHaveBeenCalledWith({
      petId: "b",
      title: "Vet visit",
      dueAt: new Date(2026, 9, 3, 9, 30).toISOString(),
    });
    expect(view.getByLabelText(dateLabel(1))).toBeTruthy();
  });

  it("keeps the form and its values when the backend rejects a save", async () => {
    mockCreateReminder.mockRejectedValue(new Error("API unavailable"));
    const view = await render(<OwnerCareCalendar pets={pets} />);
    await waitFor(() =>
      expect(view.queryByText("Loading care schedules…")).toBeNull(),
    );
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Add a reminder"));
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Assign reminder to Cooper"));
    });
    await act(async () => {
      await fireEvent.changeText(view.getByLabelText("Reminder"), "Checkup");
      await fireEvent.changeText(view.getByLabelText("Date"), "10/03/2026");
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Save reminder"));
    });
    await waitFor(() => expect(view.getByText("API unavailable")).toBeTruthy());
    expect(view.getByLabelText("Reminder").props.value).toBe("Checkup");
    expect(view.getByLabelText(dateLabel(0))).toBeTruthy();
  });

  it("validates an elapsed time and prevents duplicate submissions while saving", async () => {
    let resolveSave: (value: HealthReminder) => void = () => {};
    mockCreateReminder.mockImplementation(
      () =>
        new Promise<HealthReminder>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const view = await render(<OwnerCareCalendar pets={pets} />);
    await waitFor(() =>
      expect(view.queryByText("Loading care schedules…")).toBeNull(),
    );
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Add a reminder"));
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Assign reminder to Cooper"));
    });
    await act(async () => {
      await fireEvent.changeText(view.getByLabelText("Reminder"), "Checkup");
      await fireEvent.changeText(view.getByLabelText("Date"), "10/01/2026");
      await fireEvent.changeText(view.getByLabelText("Time"), "07:00 AM");
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Save reminder"));
    });
    expect(
      view.getByText("Choose a date and time in the future."),
    ).toBeTruthy();
    expect(mockCreateReminder).not.toHaveBeenCalled();
    await act(async () => {
      await fireEvent.changeText(view.getByLabelText("Date"), "10/03/2026");
    });
    await act(async () => {
      await fireEvent.press(view.getByLabelText("Save reminder"));
      await fireEvent.press(view.getByLabelText("Save reminder"));
    });
    expect(mockCreateReminder).toHaveBeenCalledTimes(1);
    await act(async () => {
      const saved = entry("saved");
      mockStoredReminders = [saved];
      resolveSave(saved);
    });
  });
});
