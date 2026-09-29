import type {
  Appointment,
  AppointmentInput,
  ClinicAppointmentInput,
  ClinicAppointmentUpdate,
  ClinicPatient,
  ClinicSummary,
  HealthRecord,
  HealthRecordInput,
  HealthReminder,
  HealthReminderInput,
  HealthReminderUpdate,
  VaccinationInput,
} from "../../../shared/contracts";
import { authenticatedFetch } from "./auth";

export async function listClinics(): Promise<ClinicSummary[]> {
  return (await authenticatedFetch<{ clinics: ClinicSummary[] }>("/v1/clinics"))
    .clinics;
}

export async function listHealthRecords(
  petId?: string,
): Promise<HealthRecord[]> {
  const query = petId ? `?petId=${encodeURIComponent(petId)}` : "";
  return (
    await authenticatedFetch<{ records: HealthRecord[] }>(
      `/v1/health-records${query}`,
    )
  ).records;
}

export async function listHealthReminders(
  petId?: string,
): Promise<HealthReminder[]> {
  const query = petId ? `?petId=${encodeURIComponent(petId)}` : "";
  return (
    await authenticatedFetch<{ reminders: HealthReminder[] }>(
      `/v1/reminders${query}`,
    )
  ).reminders;
}

export const createHealthReminder = (input: HealthReminderInput) =>
  authenticatedFetch<HealthReminder>("/v1/reminders", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateHealthReminder = (id: string, input: HealthReminderUpdate) =>
  authenticatedFetch<HealthReminder>(
    `/v1/reminders/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

export const deleteHealthReminder = (id: string) =>
  authenticatedFetch<void>(`/v1/reminders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export async function listAppointments(): Promise<Appointment[]> {
  return (
    await authenticatedFetch<{ appointments: Appointment[] }>(
      "/v1/appointments",
    )
  ).appointments;
}

export const createAppointment = (input: AppointmentInput) =>
  authenticatedFetch<Appointment>("/v1/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const cancelAppointment = (id: string) =>
  authenticatedFetch<Appointment>(
    `/v1/appointments/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );

export const getClinic = () => authenticatedFetch<ClinicSummary>("/v1/clinic");

export async function listClinicAppointments(): Promise<Appointment[]> {
  return (
    await authenticatedFetch<{ appointments: Appointment[] }>(
      "/v1/clinic/appointments",
    )
  ).appointments;
}

export const updateClinicAppointment = (
  id: string,
  input: ClinicAppointmentUpdate,
) =>
  authenticatedFetch<Appointment>(
    `/v1/clinic/appointments/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

function clinicPatientBase(token: string) {
  return `/v1/clinic/patients/recovery/${encodeURIComponent(token)}`;
}

export const getClinicPatient = (token: string) =>
  authenticatedFetch<ClinicPatient>(clinicPatientBase(token));

export async function listClinicPatientHealthRecords(
  token: string,
): Promise<HealthRecord[]> {
  return (
    await authenticatedFetch<{ records: HealthRecord[] }>(
      `${clinicPatientBase(token)}/health-records`,
    )
  ).records;
}

export const createClinicHealthRecord = (
  token: string,
  input: HealthRecordInput,
) =>
  authenticatedFetch<HealthRecord>(
    `${clinicPatientBase(token)}/health-records`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

export const createClinicVaccination = (
  token: string,
  input: VaccinationInput,
) =>
  authenticatedFetch<HealthRecord>(`${clinicPatientBase(token)}/vaccinations`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const createClinicAppointment = (
  token: string,
  input: ClinicAppointmentInput,
) =>
  authenticatedFetch<Appointment>(`${clinicPatientBase(token)}/appointments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
