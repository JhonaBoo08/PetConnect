import type {
  Appointment,
  AppointmentInput,
  CareCalendarRange,
  ClinicSummary,
  HealthRecord,
  HealthReminder,
  HealthReminderInput,
  HealthReminderUpdate,
} from "../../../shared/contracts";
import { authenticatedFetch } from "./auth";
import { cachedRequest, invalidateCached } from "./resource-cache";

const clinicsCacheKey = "care:clinics";
const recordsCachePrefix = "care:records:";
const remindersCachePrefix = "care:reminders:";
const appointmentsCachePrefix = "care:appointments:";

function invalidateOwnerCare() {
  invalidateCached(recordsCachePrefix);
  invalidateCached(remindersCachePrefix);
  invalidateCached(appointmentsCachePrefix);
}

export async function listClinics(): Promise<ClinicSummary[]> {
  return cachedRequest(
    clinicsCacheKey,
    async () =>
      (await authenticatedFetch<{ clinics: ClinicSummary[] }>("/v1/clinics"))
        .clinics,
    { ttlMs: 60_000 },
  );
}

export async function listHealthRecords(
  petId?: string,
): Promise<HealthRecord[]> {
  const query = petId ? `?petId=${encodeURIComponent(petId)}` : "";
  return cachedRequest(
    recordsCachePrefix + query,
    async () =>
      (
        await authenticatedFetch<{ records: HealthRecord[] }>(
          `/v1/health-records${query}`,
        )
      ).records,
    { ttlMs: 20_000 },
  );
}

function careQuery(range?: CareCalendarRange, petId?: string): string {
  const parts: string[] = [];
  if (petId) parts.push("petId=" + encodeURIComponent(petId));
  if (range) {
    parts.push(
      "from=" + encodeURIComponent(range.from),
      "to=" + encodeURIComponent(range.to),
    );
  }
  return parts.length ? "?" + parts.join("&") : "";
}

export async function listHealthReminders(
  petId?: string,
  range?: CareCalendarRange,
): Promise<HealthReminder[]> {
  const query = careQuery(range, petId);
  return cachedRequest(
    remindersCachePrefix + query,
    async () =>
      (
        await authenticatedFetch<{ reminders: HealthReminder[] }>(
          `/v1/reminders${query}`,
        )
      ).reminders,
    { ttlMs: 15_000 },
  );
}

export async function getHealthReminder(id: string): Promise<HealthReminder> {
  return authenticatedFetch<HealthReminder>(
    "/v1/reminders/" + encodeURIComponent(id),
  );
}

export async function createHealthReminder(
  input: HealthReminderInput,
): Promise<HealthReminder> {
  const reminder = await authenticatedFetch<HealthReminder>("/v1/reminders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  invalidateOwnerCare();
  return reminder;
}

export async function updateHealthReminder(
  id: string,
  input: HealthReminderUpdate,
): Promise<HealthReminder> {
  const reminder = await authenticatedFetch<HealthReminder>(
    `/v1/reminders/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  invalidateOwnerCare();
  return reminder;
}

export async function deleteHealthReminder(id: string): Promise<void> {
  await authenticatedFetch<void>(`/v1/reminders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  invalidateOwnerCare();
}

export async function listAppointments(
  range?: CareCalendarRange,
): Promise<Appointment[]> {
  const query = careQuery(range);
  return cachedRequest(
    appointmentsCachePrefix + query,
    async () =>
      (
        await authenticatedFetch<{ appointments: Appointment[] }>(
          "/v1/appointments" + query,
        )
      ).appointments,
    { ttlMs: 15_000 },
  );
}

export async function createAppointment(
  input: AppointmentInput,
): Promise<Appointment> {
  const appointment = await authenticatedFetch<Appointment>(
    "/v1/appointments",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  invalidateOwnerCare();
  return appointment;
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const appointment = await authenticatedFetch<Appointment>(
    `/v1/appointments/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );
  invalidateOwnerCare();
  return appointment;
}
