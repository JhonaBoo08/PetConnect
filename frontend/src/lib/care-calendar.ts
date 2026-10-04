import type { Appointment, HealthReminder } from "../../../shared/contracts";

export const CARE_COLORS = [
  "#DCE8DF",
  "#F9E7C2",
  "#DDE7EA",
  "#F6DEDA",
  "#D6E9E6",
];

export type CareItem =
  | {
      kind: "reminder";
      key: string;
      petId: string;
      petName: string;
      title: string;
      at: string;
      reminder: HealthReminder;
    }
  | {
      kind: "appointment";
      key: string;
      petId: string;
      petName: string;
      title: string;
      at: string;
      appointment: Appointment;
      reminder?: HealthReminder;
    };

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateKey(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function monthDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
}

export function monthRange(month: Date): { from: string; to: string } {
  const days = monthDays(month);
  const end = new Date(days[41]);
  end.setDate(end.getDate() + 1);
  return { from: days[0].toISOString(), to: end.toISOString() };
}

export function shiftMonth(month: Date, offset: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

export function buildCareItems(
  reminders: HealthReminder[],
  appointments: Appointment[],
): CareItem[] {
  const appointmentIds = new Set(appointments.map((item) => item.id));
  const linked = new Map(
    reminders
      .filter(
        (item) =>
          item.sourceType === "APPOINTMENT" &&
          item.sourceId &&
          item.status !== "CANCELLED",
      )
      .map((item) => [item.sourceId!, item]),
  );
  const items: CareItem[] = [
    ...appointments
      .filter((item) => item.status !== "CANCELLED")
      .map((appointment): CareItem => ({
        kind: "appointment",
        key: "appointment:" + appointment.id,
        petId: appointment.petId,
        petName: appointment.petName,
        title: appointment.reason || "Vet appointment",
        at: appointment.appointmentDate,
        appointment,
        reminder: linked.get(appointment.id),
      })),
    ...reminders
      .filter(
        (item) =>
          item.status !== "CANCELLED" &&
          !(
            item.sourceType === "APPOINTMENT" &&
            item.sourceId &&
            appointmentIds.has(item.sourceId)
          ),
      )
      .map((reminder): CareItem => ({
        kind: "reminder",
        key: "reminder:" + reminder.id,
        petId: reminder.petId,
        petName: reminder.petName,
        title: reminder.title,
        at: reminder.dueAt,
        reminder,
      })),
  ];
  return items
    .filter((item) => Number.isFinite(new Date(item.at).getTime()))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function itemsByDay(
  items: CareItem[],
  petId: string,
): Map<string, CareItem[]> {
  const result = new Map<string, CareItem[]>();
  for (const item of items) {
    if (petId && item.petId !== petId) continue;
    const key = localDateKey(new Date(item.at));
    result.set(key, [...(result.get(key) || []), item]);
  }
  return result;
}

export function dateInputValue(key: string): string {
  const [year, month, day] = key.split("-");
  return month + "/" + day + "/" + year;
}

export function inputDateKey(value: string): string {
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match) [, year, month, day] = match.map(Number);
  else {
    match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) return "";
    [, month, day, year] = match.map(Number);
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? localDateKey(date)
    : "";
}

export function inputTime24(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return "";
  if (match[3]) {
    if (hour < 1 || hour > 12) return "";
    hour = (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  } else if (hour > 23) return "";
  return pad(hour) + ":" + pad(minute);
}

export function timeInputValue(value: string): string {
  const time = inputTime24(value);
  if (!time) return value;
  const [hour, minute] = time.split(":").map(Number);
  return pad(hour % 12 || 12) + ":" + pad(minute) + (hour < 12 ? " AM" : " PM");
}

export function scheduleIso(
  dateValue: string,
  timeValue: string,
  now = Date.now(),
): string {
  const key = inputDateKey(dateValue);
  if (!key) throw new Error("Choose a valid date.");
  const time = inputTime24(timeValue);
  if (!time) throw new Error("Choose a valid time.");
  const [year, month, day] = key.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getHours() !== hour || date.getMinutes() !== minute)
    throw new Error(
      "That time is unavailable on this date. Choose another time.",
    );
  if (date.getTime() <= now)
    throw new Error("Choose a date and time in the future.");
  return date.toISOString();
}

export function defaultReminderTime(day: Date, now = new Date()): string {
  if (localDateKey(day) !== localDateKey(now)) return "09:00 AM";
  const morning = new Date(now);
  morning.setHours(9, 0, 0, 0);
  if (morning.getTime() > now.getTime()) return "09:00 AM";
  const next = new Date(now.getTime() + 30 * 60 * 1000);
  if (localDateKey(next) !== localDateKey(day)) return "11:59 PM";
  return timeInputValue(pad(next.getHours()) + ":" + pad(next.getMinutes()));
}

export const careTime = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
export const careDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export const careDayLabel = (date: Date) =>
  date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
export const statusLabel = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase();
