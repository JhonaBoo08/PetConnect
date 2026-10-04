import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  Appointment,
  AppointmentInput,
  CareCalendarRange,
  ClinicAppointmentInput,
  ClinicAppointmentUpdate,
  ClinicPatient,
  ClinicSummary,
  HealthRecord,
  HealthRecordInput,
  HealthRecordType,
  HealthReminder,
  HealthReminderInput,
  HealthReminderUpdate,
  Pet,
  VaccinationInput,
} from "../../../shared/contracts.js";
import { Notifications } from "./notifications.js";
import { ScheduledNotifications } from "./scheduled-notifications.js";

type RecordRow = RowDataPacket & {
  id: string;
  pet_id: string;
  pet_name: string;
  clinic_id: string;
  clinic_name: string;
  clinic_address: string;
  clinic_phone: string | null;
  vet_name: string;
  record_type: string;
  title: string;
  notes: string | null;
  occurred_at: Date;
  vaccine_name: string | null;
  dose_number: string | null;
  lot_number: string | null;
  next_due_at: Date | null;
  created_at: Date;
};

type ReminderRow = RowDataPacket & {
  id: string;
  pet_id: string;
  pet_name: string;
  clinic_id: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  clinic_phone: string | null;
  source_type: "MANUAL" | "VACCINATION" | "APPOINTMENT";
  source_id: string | null;
  title: string;
  notes: string | null;
  due_at: Date;
  notify_at: Date;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  completed_at: Date | null;
  created_at: Date;
};

type AppointmentRow = RowDataPacket & {
  id: string;
  pet_id: string;
  pet_name: string;
  species: string;
  breed: string | null;
  photo_url: string | null;
  clinic_id: string;
  clinic_name: string;
  clinic_address: string;
  clinic_phone: string | null;
  owner_id: string;
  owner_name: string;
  owner_phone: string | null;
  vet_name: string | null;
  appointment_date: Date;
  status: "REQUESTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
  reason: string | null;
  reminder_minutes_before: number;
  created_at: Date;
  updated_at: Date;
};

type PetPatientRow = RowDataPacket & {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: "Male" | "Female" | null;
  age_label: string | null;
  identifying_details: string | null;
  microchip_number: string | null;
  photo_url: string | null;
  created_at: Date;
  updated_at: Date;
  owner_id: string;
  owner_name: string;
  owner_phone: string | null;
};

const allowedRecordTypes = new Set<HealthRecordType>([
  "CHECKUP",
  "VACCINATION",
  "MEDICATION",
  "LAB",
  "PROCEDURE",
  "OTHER",
]);

const recordSelect = `
  SELECT hr.id, hr.pet_id, p.name AS pet_name, hr.clinic_id,
         c.name AS clinic_name, c.address AS clinic_address,
         c.phone AS clinic_phone, u.display_name AS vet_name,
         hr.record_type, hr.title, hr.notes, hr.occurred_at,
         hr.vaccine_name, hr.dose_number, hr.lot_number, hr.next_due_at,
         hr.created_at
    FROM health_records hr
    JOIN pets p ON p.id = hr.pet_id
    JOIN clinics c ON c.id = hr.clinic_id
    JOIN users u ON u.id = hr.vet_id
`;

const reminderSelect = `
  SELECT r.id, r.pet_id, p.name AS pet_name, r.clinic_id,
         c.name AS clinic_name, c.address AS clinic_address,
         c.phone AS clinic_phone, r.source_type, r.source_id, r.title,
         r.notes, r.due_at, r.notify_at, r.status, r.completed_at,
         r.created_at
    FROM health_reminders r
    JOIN pets p ON p.id = r.pet_id
    LEFT JOIN clinics c ON c.id = r.clinic_id
`;

const appointmentSelect = `
  SELECT a.id, a.pet_id, p.name AS pet_name, p.species, p.breed, p.photo_url,
         a.clinic_id, c.name AS clinic_name, c.address AS clinic_address,
         c.phone AS clinic_phone, a.owner_id, o.display_name AS owner_name,
         CASE WHEN o.share_phone_with_clinics = 1 THEN o.phone ELSE NULL END
           AS owner_phone,
         v.display_name AS vet_name,
         a.appointment_date, a.status, a.reason, a.reminder_minutes_before,
         a.created_at, a.updated_at
    FROM appointments a
    JOIN pets p ON p.id = a.pet_id
    JOIN clinics c ON c.id = a.clinic_id
    JOIN users o ON o.id = a.owner_id
    LEFT JOIN users v ON v.id = a.vet_id
`;

export class HealthClinicValidationError extends Error {}
export class HealthClinicConflictError extends Error {}
export class HealthClinicAccessError extends Error {}

function cleanText(
  value: unknown,
  max: number,
  label: string,
  required = false,
): string {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) {
    throw new HealthClinicValidationError(`${label} is required.`);
  }
  if (normalized.length > max) {
    throw new HealthClinicValidationError(
      `${label} must be at most ${max} characters.`,
    );
  }
  return normalized;
}

function parseDate(value: unknown, label: string): Date {
  const date = new Date(String(value ?? ""));
  if (!String(value ?? "").trim() || !Number.isFinite(date.getTime())) {
    throw new HealthClinicValidationError(`Invalid ${label}.`);
  }
  return date;
}

function futureDate(value: unknown, label: string): Date {
  const date = parseDate(value, label);
  if (date.getTime() <= Date.now()) {
    throw new HealthClinicValidationError(`${label} must be in the future.`);
  }
  return date;
}

function sqlDate(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function clinicFromRow(row: {
  clinic_id: string;
  clinic_name: string;
  clinic_address: string;
  clinic_phone: string | null;
}): ClinicSummary {
  return {
    id: row.clinic_id,
    name: row.clinic_name,
    address: row.clinic_address,
    phone: row.clinic_phone,
  };
}

function mapRecord(row: RecordRow): HealthRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    petName: row.pet_name,
    clinic: clinicFromRow(row),
    vetName: row.vet_name,
    recordType: row.record_type as HealthRecordType,
    title: row.title,
    notes: row.notes || "",
    occurredAt: row.occurred_at.toISOString(),
    vaccineName: row.vaccine_name,
    doseNumber: row.dose_number,
    lotNumber: row.lot_number,
    nextDueAt: row.next_due_at?.toISOString() || null,
    createdAt: row.created_at.toISOString(),
  };
}

function mapReminder(row: ReminderRow): HealthReminder {
  return {
    id: row.id,
    petId: row.pet_id,
    petName: row.pet_name,
    clinic:
      row.clinic_id && row.clinic_name && row.clinic_address
        ? {
            id: row.clinic_id,
            name: row.clinic_name,
            address: row.clinic_address,
            phone: row.clinic_phone,
          }
        : null,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    notes: row.notes || "",
    dueAt: row.due_at.toISOString(),
    notifyAt: row.notify_at.toISOString(),
    status: row.status,
    completedAt: row.completed_at?.toISOString() || null,
    createdAt: row.created_at.toISOString(),
  };
}

function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    petId: row.pet_id,
    petName: row.pet_name,
    petSpecies: row.species,
    petBreed: row.breed || "",
    petPhotoUrl: row.photo_url,
    clinic: clinicFromRow(row),
    ownerName: row.owner_name,
    ownerPhone: row.owner_phone,
    vetName: row.vet_name,
    appointmentDate: row.appointment_date.toISOString(),
    status: row.status,
    reason: row.reason || "",
    reminderMinutesBefore: Number(row.reminder_minutes_before),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function reminderMinutes(value: unknown): number {
  if (value === undefined || value === null || value === "") return 1440;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60 * 24 * 30) {
    throw new HealthClinicValidationError(
      "Appointment reminder must be between 0 and 43,200 minutes.",
    );
  }
  return minutes;
}

function reminderNotifyAt(dueAt: Date, notifyAt?: unknown): Date {
  if (notifyAt !== undefined && notifyAt !== null && notifyAt !== "") {
    const requested = parseDate(notifyAt, "notification time");
    if (requested.getTime() > dueAt.getTime()) {
      throw new HealthClinicValidationError(
        "Notification time cannot be after the due time.",
      );
    }
    return requested;
  }
  return new Date(Math.max(Date.now(), dueAt.getTime() - 24 * 60 * 60 * 1000));
}

function calendarBounds(range?: CareCalendarRange) {
  if (!range) return null;
  const from = parseDate(range.from, "calendar start");
  const to = parseDate(range.to, "calendar end");
  if (
    to.getTime() <= from.getTime() ||
    to.getTime() - from.getTime() > 62 * 86400000
  ) {
    throw new HealthClinicValidationError(
      "Calendar range must end after its start and span at most 62 days.",
    );
  }
  return { from: sqlDate(from), to: sqlDate(to) };
}

export class HealthClinic {
  constructor(
    private pool: Pool,
    private notifications: Notifications,
    private scheduler: ScheduledNotifications,
  ) {}

  async listClinics(): Promise<ClinicSummary[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: string;
        name: string;
        address: string;
        phone: string | null;
      })[]
    >(
      `SELECT id, name, address, phone
         FROM clinics
        WHERE status = 'ACTIVE'
        ORDER BY name ASC`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      phone: row.phone,
    }));
  }

  async currentClinic(clinicId: string): Promise<ClinicSummary | null> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: string;
        name: string;
        address: string;
        phone: string | null;
      })[]
    >(
      `SELECT id, name, address, phone
         FROM clinics
        WHERE id = ? AND status = 'ACTIVE'
        LIMIT 1`,
      [clinicId],
    );
    const row = rows[0];
    return row
      ? { id: row.id, name: row.name, address: row.address, phone: row.phone }
      : null;
  }

  async ownerHealthRecords(
    ownerId: string,
    petId?: string,
  ): Promise<HealthRecord[]> {
    const params: string[] = [ownerId];
    let where = " WHERE p.owner_id = ?";
    if (petId) {
      where += " AND p.id = ?";
      params.push(petId);
    }
    const [rows] = await this.pool.query<RecordRow[]>(
      recordSelect + where + " ORDER BY hr.occurred_at DESC LIMIT 250",
      params,
    );
    return rows.map(mapRecord);
  }

  async clinicPatient(
    clinicId: string,
    petId: string,
  ): Promise<ClinicPatient | null> {
    if (!(await this.currentClinic(clinicId))) return null;
    const [rows] = await this.pool.query<PetPatientRow[]>(
      `SELECT p.id, p.name, p.species, p.breed, p.sex, p.age_label,
              p.identifying_details, p.microchip_number, p.photo_url, p.created_at, p.updated_at,
              p.owner_id, o.display_name AS owner_name,
              CASE WHEN o.share_phone_with_clinics = 1 THEN o.phone ELSE NULL END
                AS owner_phone
         FROM pets p
         JOIN users o ON o.id = p.owner_id
        WHERE p.id = ? AND o.status = 'ACTIVE'
        LIMIT 1`,
      [petId],
    );
    const row = rows[0];
    if (!row) return null;

    const [clinicalHistoryGranted, clinicalAccessGranted] = await Promise.all([
      this.hasClinicRelationship(clinicId, petId),
      this.hasClinicAccess(clinicId, petId),
    ]);
    const [records, appointments] = await Promise.all([
      clinicalHistoryGranted
        ? this.recordsForPet(petId, 20)
        : Promise.resolve([]),
      this.appointmentsForPetAtClinic(petId, clinicId),
    ]);

    const pet: Pet = {
      id: row.id,
      name: row.name,
      species: row.species,
      breed: row.breed || "",
      sex: row.sex || "",
      ageLabel: row.age_label || "",
      identifyingDetails: row.identifying_details || "",
      microchipNumber: row.microchip_number || "",
      photoUrl: row.photo_url,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };

    return {
      pet,
      owner: {
        displayName: row.owner_name,
        phone: row.owner_phone,
      },
      clinicalHistoryGranted,
      clinicalAccessGranted,
      recentHealthRecords: records,
      upcomingAppointments: appointments,
    };
  }

  async recordsForPet(petId: string, limit = 100): Promise<HealthRecord[]> {
    const [rows] = await this.pool.query<RecordRow[]>(
      recordSelect +
        " WHERE hr.pet_id = ? ORDER BY hr.occurred_at DESC LIMIT ?",
      [petId, Math.max(1, Math.min(250, limit))],
    );
    return rows.map(mapRecord);
  }

  async recordsForClinicPet(
    clinicId: string,
    petId: string,
    limit = 100,
  ): Promise<HealthRecord[]> {
    await this.assertClinicRelationship(clinicId, petId);
    return this.recordsForPet(petId, limit);
  }

  async createHealthRecord(
    clinicId: string,
    vetId: string,
    petId: string,
    input: HealthRecordInput,
  ): Promise<HealthRecord> {
    if (!allowedRecordTypes.has(input.recordType)) {
      throw new HealthClinicValidationError("Invalid health record type.");
    }
    const title = cleanText(input.title, 120, "Record title", true);
    const notes = cleanText(input.notes, 5000, "Notes");
    const occurredAt = input.occurredAt
      ? parseDate(input.occurredAt, "record date")
      : new Date();

    await this.assertClinicAccess(clinicId, petId);
    const id = `HR-${randomUUID().toUpperCase()}`;
    await this.pool.query(
      `INSERT INTO health_records (
        id, pet_id, clinic_id, vet_id, record_type, title, occurred_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        petId,
        clinicId,
        vetId,
        input.recordType,
        title,
        sqlDate(occurredAt),
        notes || null,
      ],
    );
    await this.audit("health_record", id, "create", vetId, {
      petId,
      clinicId,
      recordType: input.recordType,
    });
    return (await this.recordById(id))!;
  }

  async createVaccination(
    clinicId: string,
    vetId: string,
    petId: string,
    input: VaccinationInput,
  ): Promise<HealthRecord> {
    const vaccineName = cleanText(input.vaccineName, 120, "Vaccine name", true);
    const doseNumber = cleanText(input.doseNumber, 30, "Dose number");
    const lotNumber = cleanText(input.lotNumber, 80, "Lot number");
    const notes = cleanText(input.notes, 5000, "Notes");
    const administeredAt = input.administeredAt
      ? parseDate(input.administeredAt, "administered date")
      : new Date();
    const nextDueAt = input.nextDueAt
      ? futureDate(input.nextDueAt, "Next dose date")
      : null;

    const notifyAt = nextDueAt
      ? reminderNotifyAt(nextDueAt, input.notifyAt)
      : null;
    const ownerId = await this.petOwner(petId);
    if (!ownerId) throw new HealthClinicConflictError("Pet not found.");
    await this.assertClinicAccess(clinicId, petId);

    const id = `HR-${randomUUID().toUpperCase()}`;
    await this.pool.query(
      `INSERT INTO health_records (
        id, pet_id, clinic_id, vet_id, record_type, title, occurred_at, notes,
        vaccine_name, dose_number, lot_number, next_due_at
      ) VALUES (?, ?, ?, ?, 'VACCINATION', ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        petId,
        clinicId,
        vetId,
        `${vaccineName} vaccination`,
        sqlDate(administeredAt),
        notes || null,
        vaccineName,
        doseNumber || null,
        lotNumber || null,
        nextDueAt ? sqlDate(nextDueAt) : null,
      ],
    );

    if (nextDueAt) {
      await this.createLinkedReminder({
        ownerId,
        petId,
        clinicId,
        sourceType: "VACCINATION",
        sourceId: id,
        title: `${vaccineName} next dose`,
        notes: `Vaccination follow-up from ${(await this.currentClinic(clinicId))?.name || "your clinic"}.`,
        dueAt: nextDueAt,
        notifyAt: notifyAt!,
      });
    }

    await this.audit("health_record", id, "vaccination", vetId, {
      petId,
      clinicId,
      vaccineName,
      nextDueAt: nextDueAt?.toISOString() || null,
    });
    await this.notifications.notifyUser(
      ownerId,
      "HEALTH_RECORD_ADDED",
      "Vaccination record added",
      `${vaccineName} was added to your pet's PetConnect health history.`,
      { petId, healthRecordId: id },
    );
    return (await this.recordById(id))!;
  }

  async ownerReminders(
    ownerId: string,
    petId?: string,
    range?: CareCalendarRange,
  ): Promise<HealthReminder[]> {
    const params: string[] = [ownerId];
    let where = " WHERE r.owner_id = ?";
    if (petId) {
      where += " AND r.pet_id = ?";
      params.push(petId);
    }
    const bounds = calendarBounds(range);
    if (bounds) {
      where += " AND r.due_at >= ? AND r.due_at < ?";
      params.push(bounds.from, bounds.to);
    }
    const [rows] = await this.pool.query<ReminderRow[]>(
      reminderSelect +
        where +
        " ORDER BY FIELD(r.status, 'PENDING', 'COMPLETED', 'CANCELLED'), r.due_at ASC" +
        (bounds ? "" : " LIMIT 250"),
      params,
    );
    return rows.map(mapReminder);
  }

  async createOwnerReminder(
    ownerId: string,
    input: HealthReminderInput,
  ): Promise<HealthReminder> {
    const petId = cleanText(input.petId, 64, "Pet", true);
    await this.assertOwnerPet(ownerId, petId);
    const dueAt = futureDate(input.dueAt, "Due date");
    return this.createLinkedReminder({
      ownerId,
      petId,
      clinicId: null,
      sourceType: "MANUAL",
      sourceId: null,
      title: cleanText(input.title, 120, "Reminder title", true),
      notes: cleanText(input.notes, 5000, "Notes"),
      dueAt,
      notifyAt: reminderNotifyAt(dueAt, input.notifyAt),
    });
  }

  async updateOwnerReminder(
    ownerId: string,
    id: string,
    input: HealthReminderUpdate,
  ): Promise<HealthReminder | null> {
    const [existing] = await this.pool.query<ReminderRow[]>(
      reminderSelect + " WHERE r.id = ? AND r.owner_id = ? LIMIT 1",
      [id, ownerId],
    );
    const current = existing[0];
    if (!current) return null;

    const title =
      input.title === undefined
        ? current.title
        : cleanText(input.title, 120, "Reminder title", true);
    const notes =
      input.notes === undefined
        ? current.notes || ""
        : cleanText(input.notes, 5000, "Notes");
    const dueAt =
      input.dueAt === undefined
        ? current.due_at
        : futureDate(input.dueAt, "Due date");
    const notifyAt = reminderNotifyAt(
      dueAt,
      input.notifyAt === undefined
        ? current.notify_at.toISOString()
        : input.notifyAt,
    );
    const status = input.status || current.status;
    if (!["PENDING", "COMPLETED", "CANCELLED"].includes(status)) {
      throw new HealthClinicValidationError("Invalid reminder status.");
    }

    await this.pool.query(
      `UPDATE health_reminders
          SET title = ?, notes = ?, due_at = ?, notify_at = ?, status = ?,
              completed_at = CASE
                WHEN ? = 'COMPLETED' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
                WHEN ? <> 'COMPLETED' THEN NULL
                ELSE completed_at
              END
        WHERE id = ? AND owner_id = ?`,
      [
        title,
        notes || null,
        sqlDate(dueAt),
        sqlDate(notifyAt),
        status,
        status,
        status,
        id,
        ownerId,
      ],
    );

    if (status === "PENDING") {
      await this.scheduleReminderNotification(
        id,
        ownerId,
        current.pet_name,
        title,
        notifyAt,
      );
    } else {
      await this.scheduler.cancel(`health-reminder:${id}`);
    }
    return this.reminderById(ownerId, id);
  }

  async deleteOwnerReminder(ownerId: string, id: string): Promise<boolean> {
    const [result] = await this.pool.query(
      "DELETE FROM health_reminders WHERE id = ? AND owner_id = ?",
      [id, ownerId],
    );
    const affected = Number(
      (result as { affectedRows?: number }).affectedRows || 0,
    );
    if (affected) await this.scheduler.cancel(`health-reminder:${id}`);
    return affected > 0;
  }

  async ownerAppointments(
    ownerId: string,
    range?: CareCalendarRange,
  ): Promise<Appointment[]> {
    const bounds = calendarBounds(range);
    const params: string[] = [ownerId];
    let where = " WHERE a.owner_id = ?";
    if (bounds) {
      where += " AND a.appointment_date >= ? AND a.appointment_date < ?";
      params.push(bounds.from, bounds.to);
    }
    const [rows] = await this.pool.query<AppointmentRow[]>(
      appointmentSelect +
        where +
        " ORDER BY a.appointment_date DESC" +
        (bounds ? "" : " LIMIT 250"),
      params,
    );
    return rows.map(mapAppointment);
  }

  async createOwnerAppointment(
    ownerId: string,
    input: AppointmentInput,
  ): Promise<Appointment> {
    const petId = cleanText(input.petId, 64, "Pet", true);
    const clinicId = cleanText(input.clinicId, 64, "Clinic", true);
    await this.assertOwnerPet(ownerId, petId);
    if (!(await this.currentClinic(clinicId))) {
      throw new HealthClinicConflictError("Clinic not found.");
    }
    const appointmentDate = futureDate(
      input.appointmentDate,
      "Appointment date",
    );
    const reason = cleanText(input.reason, 2000, "Appointment reason");
    const minutes = reminderMinutes(input.reminderMinutesBefore);
    const id = `AP-${randomUUID().toUpperCase()}`;

    await this.pool.query(
      `INSERT INTO appointments (
        id, pet_id, clinic_id, owner_id, appointment_date, status, reason,
        reminder_minutes_before
      ) VALUES (?, ?, ?, ?, ?, 'REQUESTED', ?, ?)`,
      [
        id,
        petId,
        clinicId,
        ownerId,
        sqlDate(appointmentDate),
        reason || null,
        minutes,
      ],
    );

    const appointment = (await this.appointmentById(id))!;
    await this.notifications.notifyClinicMembers(
      clinicId,
      "APPOINTMENT_REQUESTED",
      "New appointment request",
      `${appointment.ownerName} requested an appointment for ${appointment.petName}.`,
      { appointmentId: id, petId },
    );
    await this.audit("appointment", id, "request", ownerId, {
      clinicId,
      petId,
      appointmentDate: appointmentDate.toISOString(),
    });
    return appointment;
  }

  async cancelOwnerAppointment(
    ownerId: string,
    id: string,
  ): Promise<Appointment | null> {
    const [result] = await this.pool.query(
      `UPDATE appointments
          SET status = 'CANCELLED'
        WHERE id = ? AND owner_id = ?
          AND status IN ('REQUESTED', 'SCHEDULED')`,
      [id, ownerId],
    );
    if (Number((result as { affectedRows?: number }).affectedRows || 0) === 0) {
      return this.ownerAppointmentById(ownerId, id);
    }
    await this.cancelAppointmentReminder(id);
    const appointment = await this.ownerAppointmentById(ownerId, id);
    if (appointment) {
      await this.notifications.notifyClinicMembers(
        appointment.clinic.id,
        "APPOINTMENT_CANCELLED",
        "Appointment cancelled",
        `${appointment.ownerName} cancelled ${appointment.petName}'s appointment.`,
        { appointmentId: id, petId: appointment.petId },
      );
    }
    return appointment;
  }

  async clinicAppointments(clinicId: string): Promise<Appointment[]> {
    const [rows] = await this.pool.query<AppointmentRow[]>(
      appointmentSelect +
        ` WHERE a.clinic_id = ?
          ORDER BY FIELD(a.status, 'REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'),
                   a.appointment_date ASC
          LIMIT 300`,
      [clinicId],
    );
    return rows.map(mapAppointment);
  }

  async clinicCreateAppointment(
    clinicId: string,
    vetId: string,
    petId: string,
    input: ClinicAppointmentInput,
  ): Promise<Appointment> {
    await this.assertClinicAccess(clinicId, petId);
    const ownerId = await this.petOwner(petId);
    if (!ownerId) throw new HealthClinicConflictError("Pet not found.");
    const appointmentDate = futureDate(
      input.appointmentDate,
      "Appointment date",
    );
    const reason = cleanText(input.reason, 2000, "Appointment reason");
    const minutes = reminderMinutes(input.reminderMinutesBefore);
    const id = `AP-${randomUUID().toUpperCase()}`;
    await this.pool.query(
      `INSERT INTO appointments (
        id, pet_id, clinic_id, owner_id, vet_id, appointment_date, status,
        reason, reminder_minutes_before
      ) VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
      [
        id,
        petId,
        clinicId,
        ownerId,
        vetId,
        sqlDate(appointmentDate),
        reason || null,
        minutes,
      ],
    );
    const appointment = (await this.appointmentById(id))!;
    await this.syncAppointmentReminder(appointment);
    await this.notifications.notifyUser(
      ownerId,
      "APPOINTMENT_SCHEDULED",
      "Veterinary appointment scheduled",
      `${appointment.petName} is scheduled at ${appointment.clinic.name}.`,
      { appointmentId: id, petId },
    );
    await this.audit("appointment", id, "schedule", vetId, {
      clinicId,
      petId,
      appointmentDate: appointmentDate.toISOString(),
    });
    return appointment;
  }

  async updateClinicAppointment(
    clinicId: string,
    vetId: string,
    id: string,
    input: ClinicAppointmentUpdate,
  ): Promise<Appointment | null> {
    const current = await this.clinicAppointmentById(clinicId, id);
    if (!current) return null;

    const status = input.status || current.status;
    if (
      !["REQUESTED", "SCHEDULED", "COMPLETED", "CANCELLED"].includes(status)
    ) {
      throw new HealthClinicValidationError("Invalid appointment status.");
    }
    if (
      (current.status === "COMPLETED" || current.status === "CANCELLED") &&
      status !== current.status
    ) {
      throw new HealthClinicConflictError(
        "Completed or cancelled appointments cannot be reopened.",
      );
    }
    if (status === "REQUESTED" && current.status !== "REQUESTED") {
      throw new HealthClinicConflictError(
        "An appointment cannot be moved back to requested.",
      );
    }

    const appointmentDate =
      input.appointmentDate === undefined
        ? new Date(current.appointmentDate)
        : status === "COMPLETED"
          ? parseDate(input.appointmentDate, "Appointment date")
          : futureDate(input.appointmentDate, "Appointment date");
    const reason =
      input.reason === undefined
        ? current.reason
        : cleanText(input.reason, 2000, "Appointment reason");
    const minutes =
      input.reminderMinutesBefore === undefined
        ? current.reminderMinutesBefore
        : reminderMinutes(input.reminderMinutesBefore);
    const assignedVet =
      status === "SCHEDULED" || status === "COMPLETED"
        ? vetId
        : current.vetName
          ? vetId
          : null;

    await this.pool.query(
      `UPDATE appointments
          SET status = ?, appointment_date = ?, reason = ?,
              reminder_minutes_before = ?, vet_id = ?
        WHERE id = ? AND clinic_id = ?`,
      [
        status,
        sqlDate(appointmentDate),
        reason || null,
        minutes,
        assignedVet,
        id,
        clinicId,
      ],
    );

    const appointment = (await this.clinicAppointmentById(clinicId, id))!;
    if (status === "SCHEDULED") {
      await this.syncAppointmentReminder(appointment);
      const ownerId = await this.petOwner(current.petId);
      if (ownerId) {
        await this.notifications.notifyUser(
          ownerId,
          "APPOINTMENT_SCHEDULED",
          "Appointment confirmed",
          `${appointment.petName}'s appointment at ${appointment.clinic.name} is confirmed.`,
          { appointmentId: id, petId: appointment.petId },
        );
      }
    } else if (status === "CANCELLED" || status === "COMPLETED") {
      await this.cancelAppointmentReminder(id, status === "COMPLETED");
      const ownerId = await this.petOwner(appointment.petId);
      if (ownerId) {
        await this.notifications.notifyUser(
          ownerId,
          status === "COMPLETED"
            ? "APPOINTMENT_COMPLETED"
            : "APPOINTMENT_CANCELLED",
          status === "COMPLETED"
            ? "Appointment completed"
            : "Appointment cancelled",
          `${appointment.petName}'s appointment at ${appointment.clinic.name} was ${status === "COMPLETED" ? "completed" : "cancelled"}.`,
          { appointmentId: id, petId: appointment.petId },
        );
      }
    }
    await this.audit("appointment", id, "clinic_update", vetId, {
      status,
      appointmentDate: appointmentDate.toISOString(),
    });
    return appointment;
  }

  private async recordById(id: string): Promise<HealthRecord | null> {
    const [rows] = await this.pool.query<RecordRow[]>(
      recordSelect + " WHERE hr.id = ? LIMIT 1",
      [id],
    );
    return rows[0] ? mapRecord(rows[0]) : null;
  }

  private async reminderById(
    ownerId: string,
    id: string,
  ): Promise<HealthReminder | null> {
    const [rows] = await this.pool.query<ReminderRow[]>(
      reminderSelect + " WHERE r.id = ? AND r.owner_id = ? LIMIT 1",
      [id, ownerId],
    );
    return rows[0] ? mapReminder(rows[0]) : null;
  }

  private async appointmentById(id: string): Promise<Appointment | null> {
    const [rows] = await this.pool.query<AppointmentRow[]>(
      appointmentSelect + " WHERE a.id = ? LIMIT 1",
      [id],
    );
    return rows[0] ? mapAppointment(rows[0]) : null;
  }

  private async ownerAppointmentById(
    ownerId: string,
    id: string,
  ): Promise<Appointment | null> {
    const [rows] = await this.pool.query<AppointmentRow[]>(
      appointmentSelect + " WHERE a.id = ? AND a.owner_id = ? LIMIT 1",
      [id, ownerId],
    );
    return rows[0] ? mapAppointment(rows[0]) : null;
  }

  private async clinicAppointmentById(
    clinicId: string,
    id: string,
  ): Promise<Appointment | null> {
    const [rows] = await this.pool.query<AppointmentRow[]>(
      appointmentSelect + " WHERE a.id = ? AND a.clinic_id = ? LIMIT 1",
      [id, clinicId],
    );
    return rows[0] ? mapAppointment(rows[0]) : null;
  }

  private async appointmentsForPetAtClinic(
    petId: string,
    clinicId: string,
  ): Promise<Appointment[]> {
    const [rows] = await this.pool.query<AppointmentRow[]>(
      appointmentSelect +
        ` WHERE a.pet_id = ? AND a.clinic_id = ?
            AND a.status IN ('REQUESTED', 'SCHEDULED')
          ORDER BY a.appointment_date ASC`,
      [petId, clinicId],
    );
    return rows.map(mapAppointment);
  }

  private async assertOwnerPet(ownerId: string, petId: string): Promise<void> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT id FROM pets WHERE id = ? AND owner_id = ? LIMIT 1",
      [petId, ownerId],
    );
    if (!rows[0]) throw new HealthClinicConflictError("Pet not found.");
  }

  private async assertClinicAndPet(
    clinicId: string,
    petId: string,
  ): Promise<void> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT p.id
         FROM pets p
         JOIN clinics c ON c.id = ?
        WHERE p.id = ? AND c.status = 'ACTIVE'
        LIMIT 1`,
      [clinicId, petId],
    );
    if (!rows[0]) {
      throw new HealthClinicConflictError("Clinic or pet not found.");
    }
  }

  private async hasClinicAccess(
    clinicId: string,
    petId: string,
  ): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT a.id
         FROM appointments a
         JOIN clinics c ON c.id = a.clinic_id AND c.status = 'ACTIVE'
        WHERE a.clinic_id = ?
          AND a.pet_id = ?
          AND a.status IN ('REQUESTED', 'SCHEDULED')
        LIMIT 1`,
      [clinicId, petId],
    );
    return Boolean(rows[0]);
  }

  private async hasClinicRelationship(
    clinicId: string,
    petId: string,
  ): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT a.id
         FROM appointments a
         JOIN clinics c ON c.id = a.clinic_id AND c.status = 'ACTIVE'
        WHERE a.clinic_id = ?
          AND a.pet_id = ?
          AND a.status IN ('REQUESTED', 'SCHEDULED', 'COMPLETED')
        LIMIT 1`,
      [clinicId, petId],
    );
    return Boolean(rows[0]);
  }

  private async assertClinicRelationship(
    clinicId: string,
    petId: string,
  ): Promise<void> {
    await this.assertClinicAndPet(clinicId, petId);
    if (!(await this.hasClinicRelationship(clinicId, petId))) {
      throw new HealthClinicAccessError(
        "Owner authorization is required. Ask the owner to request an appointment with this clinic before viewing clinical history.",
      );
    }
  }

  private async assertClinicAccess(
    clinicId: string,
    petId: string,
  ): Promise<void> {
    await this.assertClinicAndPet(clinicId, petId);
    if (!(await this.hasClinicAccess(clinicId, petId))) {
      throw new HealthClinicAccessError(
        "An active owner-requested appointment is required before making clinical changes.",
      );
    }
  }

  private async petOwner(petId: string): Promise<string | null> {
    const [rows] = await this.pool.query<
      (RowDataPacket & { owner_id: string })[]
    >("SELECT owner_id FROM pets WHERE id = ? LIMIT 1", [petId]);
    return rows[0]?.owner_id || null;
  }

  private async createLinkedReminder(input: {
    ownerId: string;
    petId: string;
    clinicId: string | null;
    sourceType: "MANUAL" | "VACCINATION" | "APPOINTMENT";
    sourceId: string | null;
    title: string;
    notes: string;
    dueAt: Date;
    notifyAt: Date;
  }): Promise<HealthReminder> {
    const id = `RM-${randomUUID().toUpperCase()}`;
    await this.pool.query(
      `INSERT INTO health_reminders (
        id, pet_id, owner_id, clinic_id, source_type, source_id, title, notes,
        due_at, notify_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id,
        input.petId,
        input.ownerId,
        input.clinicId,
        input.sourceType,
        input.sourceId,
        input.title,
        input.notes || null,
        sqlDate(input.dueAt),
        sqlDate(input.notifyAt),
      ],
    );
    const [rows] = await this.pool.query<ReminderRow[]>(
      reminderSelect + " WHERE r.id = ? LIMIT 1",
      [id],
    );
    const reminder = mapReminder(rows[0]);
    await this.scheduleReminderNotification(
      id,
      input.ownerId,
      reminder.petName,
      input.title,
      input.notifyAt,
    );
    return reminder;
  }

  private async scheduleReminderNotification(
    reminderId: string,
    ownerId: string,
    petName: string,
    title: string,
    notifyAt: Date,
  ) {
    await this.scheduler.schedule({
      userId: ownerId,
      type: "HEALTH_REMINDER_DUE",
      title,
      body: `${petName}: ${title}`,
      data: { reminderId },
      scheduledAt: notifyAt,
      dedupeKey: `health-reminder:${reminderId}`,
    });
  }

  private async syncAppointmentReminder(appointment: Appointment) {
    const ownerId = await this.petOwner(appointment.petId);
    if (!ownerId) return;
    const dueAt = new Date(appointment.appointmentDate);
    const notifyAt = new Date(
      dueAt.getTime() - appointment.reminderMinutesBefore * 60 * 1000,
    );
    const existing = await this.pool.query<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM health_reminders
        WHERE source_type = 'APPOINTMENT' AND source_id = ? AND owner_id = ?
        LIMIT 1`,
      [appointment.id, ownerId],
    );
    const reminderId = existing[0][0]?.id;
    const title = `Appointment at ${appointment.clinic.name}`;
    if (reminderId) {
      await this.pool.query(
        `UPDATE health_reminders
            SET clinic_id = ?, title = ?, notes = ?, due_at = ?, notify_at = ?,
                status = 'PENDING', completed_at = NULL
          WHERE id = ?`,
        [
          appointment.clinic.id,
          title,
          appointment.reason || null,
          sqlDate(dueAt),
          sqlDate(notifyAt),
          reminderId,
        ],
      );
      await this.scheduleReminderNotification(
        reminderId,
        ownerId,
        appointment.petName,
        title,
        notifyAt,
      );
      return;
    }
    await this.createLinkedReminder({
      ownerId,
      petId: appointment.petId,
      clinicId: appointment.clinic.id,
      sourceType: "APPOINTMENT",
      sourceId: appointment.id,
      title,
      notes: appointment.reason,
      dueAt,
      notifyAt,
    });
  }

  private async cancelAppointmentReminder(
    appointmentId: string,
    completed = false,
  ) {
    const [rows] = await this.pool.query<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM health_reminders
        WHERE source_type = 'APPOINTMENT' AND source_id = ?
        LIMIT 1`,
      [appointmentId],
    );
    const reminderId = rows[0]?.id;
    if (!reminderId) return;
    await this.pool.query(
      `UPDATE health_reminders
          SET status = ?, completed_at = ?
        WHERE id = ?`,
      [
        completed ? "COMPLETED" : "CANCELLED",
        completed ? new Date() : null,
        reminderId,
      ],
    );
    await this.scheduler.cancel(`health-reminder:${reminderId}`);
  }

  private async audit(
    entityType: string,
    entityId: string,
    action: string,
    performedBy: string,
    details: Record<string, unknown>,
  ) {
    await this.pool.query(
      `INSERT INTO audit_logs (
        entity_type, entity_id, action, performed_by, details
      ) VALUES (?, ?, ?, ?, ?)`,
      [entityType, entityId, action, performedBy, JSON.stringify(details)],
    );
  }
}
