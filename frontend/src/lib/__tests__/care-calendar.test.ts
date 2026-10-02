import { describe, expect, it } from "@jest/globals";
import {
  buildCareItems,
  dateInputValue,
  inputDateKey,
  inputTime24,
  itemsByDay,
  localDateKey,
  monthDays,
  monthRange,
  scheduleIso,
  shiftMonth,
} from "../care-calendar";
import type { Appointment, HealthReminder } from "../../../../shared/contracts";

const reminder = (
  id: string,
  petId: string,
  at: string,
  extra: Partial<HealthReminder> = {},
): HealthReminder => ({
  id,
  petId,
  petName: petId,
  title: id,
  dueAt: at,
  notifyAt: at,
  notes: "",
  clinic: null,
  sourceType: "MANUAL",
  sourceId: null,
  status: "PENDING",
  completedAt: null,
  createdAt: at,
  ...extra,
});
const appointment = (
  id: string,
  at: string,
  extra: Partial<Appointment> = {},
): Appointment => ({
  id,
  petId: "pet-a",
  petName: "Cooper",
  petSpecies: "Dog",
  petBreed: "",
  petPhotoUrl: null,
  clinic: { id: "clinic", name: "Vet clinic", address: "Tagum", phone: null },
  ownerName: "Owner",
  ownerPhone: null,
  vetName: null,
  appointmentDate: at,
  reason: "Checkup",
  status: "SCHEDULED",
  reminderMinutesBefore: 60,
  createdAt: at,
  updatedAt: at,
  ...extra,
});

describe("care calendar dates and events", () => {
  it("uses complete Sunday-first weeks and navigates across the year and leap days", () => {
    const cells = monthDays(new Date(2026, 9, 31));
    expect(cells).toHaveLength(42);
    expect(localDateKey(cells[0])).toBe("2026-09-27");
    expect(localDateKey(cells[41])).toBe("2026-11-07");
    expect(localDateKey(shiftMonth(new Date(2026, 11, 31), 1))).toBe(
      "2027-01-01",
    );
    expect(
      monthDays(new Date(2028, 1, 1)).some(
        (date) => localDateKey(date) === "2028-02-29",
      ),
    ).toBe(true);
    const range = monthRange(new Date(2026, 9, 1));
    expect(localDateKey(new Date(range.from))).toBe("2026-09-27");
    expect(localDateKey(new Date(range.to))).toBe("2026-11-08");
  });

  it("preserves local dates and exact AM/PM times when producing the backend timestamp", () => {
    const before = new Date(2026, 9, 1).getTime();
    const iso = scheduleIso("10/03/2026", "09:30 PM", before);
    const saved = new Date(iso);
    expect(localDateKey(saved)).toBe("2026-10-03");
    expect(saved.getHours()).toBe(21);
    expect(saved.getMinutes()).toBe(30);
    expect(inputTime24("12:00 AM")).toBe("00:00");
    expect(inputTime24("12:00 PM")).toBe("12:00");
    expect(inputDateKey("02/29/2028")).toBe("2028-02-29");
    expect(dateInputValue("2026-10-03")).toBe("10/03/2026");
  });

  it("rejects impossible dates, invalid times, and elapsed dates instead of rolling them over", () => {
    expect(inputDateKey("02/29/2026")).toBe("");
    expect(inputDateKey("04/31/2026")).toBe("");
    expect(inputTime24("24:00")).toBe("");
    expect(inputTime24("13:00 PM")).toBe("");
    expect(() =>
      scheduleIso("10/03/2026", "09:00 AM", new Date(2026, 9, 3, 10).getTime()),
    ).toThrow("future");
  });

  it("keeps multiple pets and times on the same local day while deduplicating linked appointment reminders", () => {
    const at = new Date(2026, 9, 3, 9).toISOString();
    const items = buildCareItems(
      [
        reminder("manual", "pet-b", at),
        reminder("linked", "pet-a", at, {
          sourceType: "APPOINTMENT",
          sourceId: "visit",
        }),
        reminder("cancelled", "pet-b", at, { status: "CANCELLED" }),
        reminder("invalid", "pet-b", "bad date"),
      ],
      [
        appointment("visit", at),
        appointment("cancelled-visit", at, { status: "CANCELLED" }),
      ],
    );
    expect(items).toHaveLength(2);
    expect(itemsByDay(items, "").get("2026-10-03")).toHaveLength(2);
    expect(itemsByDay(items, "pet-a").get("2026-10-03")).toHaveLength(1);
    expect(
      items.find((item) => item.kind === "appointment")?.reminder?.id,
    ).toBe("linked");
  });
});
