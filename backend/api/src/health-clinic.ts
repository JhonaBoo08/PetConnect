import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  Appointment,
  AppointmentInput,
  CareCalendarRange,
  ClinicSummary,
  HealthRecord,
  HealthRecordType,
  HealthReminder,
  HealthReminderInput,
  HealthReminderUpdate,
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
    _notifications: Notifications,
    private scheduler: ScheduledNotifications,
  ) {}

  private async inTransaction<T>(
    action: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await action(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

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

  async currentClinic(
    clinicId: string,
    connection: Pool | PoolConnection = this.pool,
  ): Promise<ClinicSummary | null> {
    const [rows] = await connection.query<
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
    return this.inTransaction(async (connection) => {
      const petId = cleanText(input.petId, 64, "Pet", true);
      await this.assertOwnerPet(ownerId, petId, connection);
      const dueAt = futureDate(input.dueAt, "Due date");
      return this.createLinkedReminder(
        {
          ownerId,
          petId,
          clinicId: null,
          sourceType: "MANUAL",
          sourceId: null,
          title: cleanText(input.title, 120, "Reminder title", true),
          notes: cleanText(input.notes, 5000, "Notes"),
          dueAt,
          notifyAt: reminderNotifyAt(dueAt, input.notifyAt),
        },
        connection,
      );
    });
  }

  async updateOwnerReminder(
    ownerId: string,
    id: string,
    input: HealthReminderUpdate,
  ): Promise<HealthReminder | null> {
    return this.inTransaction(async (connection) => {
      const [existing] = await connection.query<ReminderRow[]>(
        reminderSelect +
          " WHERE r.id = ? AND r.owner_id = ? LIMIT 1 FOR UPDATE",
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

      await connection.query(
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
          connection,
        );
      } else {
        await this.scheduler.cancel(`health-reminder:${id}`, connection);
      }
      return this.reminderById(ownerId, id, connection);
    });
  }

  async deleteOwnerReminder(ownerId: string, id: string): Promise<boolean> {
    return this.inTransaction(async (connection) => {
      const [result] = await connection.query(
        "DELETE FROM health_reminders WHERE id = ? AND owner_id = ?",
        [id, ownerId],
      );
      const affected = Number(
        (result as { affectedRows?: number }).affectedRows || 0,
      );
      if (affected)
        await this.scheduler.cancel(`health-reminder:${id}`, connection);
      return affected > 0;
    });
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
    return this.inTransaction(async (connection) => {
      const petId = cleanText(input.petId, 64, "Pet", true);
      const clinicId = cleanText(input.clinicId, 64, "Clinic", true);
      await this.assertOwnerPet(ownerId, petId, connection);
      if (!(await this.currentClinic(clinicId, connection))) {
        throw new HealthClinicConflictError("Clinic not found.");
      }
      const appointmentDate = futureDate(
        input.appointmentDate,
        "Appointment date",
      );
      const reason = cleanText(input.reason, 2000, "Appointment reason");
      const minutes = reminderMinutes(input.reminderMinutesBefore);
      const id = `AP-${randomUUID().toUpperCase()}`;

      await connection.query(
        `INSERT INTO appointments (
        id, pet_id, clinic_id, owner_id, appointment_date, status, reason,
        reminder_minutes_before
      ) VALUES (?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
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

      const appointment = (await this.appointmentById(id, connection))!;
      await this.audit(
        "appointment",
        id,
        "schedule",
        ownerId,
        {
          clinicId,
          petId,
          appointmentDate: appointmentDate.toISOString(),
        },
        connection,
      );
      await this.syncAppointmentReminder(appointment, connection);
      return appointment;
    });
  }

  async cancelOwnerAppointment(
    ownerId: string,
    id: string,
  ): Promise<Appointment | null> {
    return this.inTransaction(async (connection) => {
      const [result] = await connection.query(
        `UPDATE appointments
          SET status = 'CANCELLED'
        WHERE id = ? AND owner_id = ?
          AND status IN ('REQUESTED', 'SCHEDULED')`,
        [id, ownerId],
      );
      if (
        Number((result as { affectedRows?: number }).affectedRows || 0) === 0
      ) {
        return this.ownerAppointmentById(ownerId, id, connection);
      }
      await this.cancelAppointmentReminder(id, false, connection);
      const appointment = await this.ownerAppointmentById(
        ownerId,
        id,
        connection,
      );
      return appointment;
    });
  }

  async reminderById(
    ownerId: string,
    id: string,
    connection: Pool | PoolConnection = this.pool,
  ): Promise<HealthReminder | null> {
    const [rows] = await connection.query<ReminderRow[]>(
      reminderSelect + " WHERE r.id = ? AND r.owner_id = ? LIMIT 1",
      [id, ownerId],
    );
    return rows[0] ? mapReminder(rows[0]) : null;
  }

  private async appointmentById(
    id: string,
    connection: Pool | PoolConnection = this.pool,
  ): Promise<Appointment | null> {
    const [rows] = await connection.query<AppointmentRow[]>(
      appointmentSelect + " WHERE a.id = ? LIMIT 1",
      [id],
    );
    return rows[0] ? mapAppointment(rows[0]) : null;
  }

  private async ownerAppointmentById(
    ownerId: string,
    id: string,
    connection: Pool | PoolConnection = this.pool,
  ): Promise<Appointment | null> {
    const [rows] = await connection.query<AppointmentRow[]>(
      appointmentSelect + " WHERE a.id = ? AND a.owner_id = ? LIMIT 1",
      [id, ownerId],
    );
    return rows[0] ? mapAppointment(rows[0]) : null;
  }

  private async assertOwnerPet(
    ownerId: string,
    petId: string,
    connection: Pool | PoolConnection = this.pool,
  ): Promise<void> {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM pets WHERE id = ? AND owner_id = ? LIMIT 1 FOR UPDATE",
      [petId, ownerId],
    );
    if (!rows[0]) throw new HealthClinicConflictError("Pet not found.");
  }

  private async petOwner(
    petId: string,
    connection: Pool | PoolConnection = this.pool,
  ): Promise<string | null> {
    const [rows] = await connection.query<
      (RowDataPacket & { owner_id: string })[]
    >("SELECT owner_id FROM pets WHERE id = ? LIMIT 1", [petId]);
    return rows[0]?.owner_id || null;
  }

  private async createLinkedReminder(
    input: {
      ownerId: string;
      petId: string;
      clinicId: string | null;
      sourceType: "MANUAL" | "VACCINATION" | "APPOINTMENT";
      sourceId: string | null;
      title: string;
      notes: string;
      dueAt: Date;
      notifyAt: Date;
    },
    connection: Pool | PoolConnection = this.pool,
  ): Promise<HealthReminder> {
    const id = `RM-${randomUUID().toUpperCase()}`;
    await connection.query(
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
    const [rows] = await connection.query<ReminderRow[]>(
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
      connection,
    );
    return reminder;
  }

  private async scheduleReminderNotification(
    reminderId: string,
    ownerId: string,
    petName: string,
    title: string,
    notifyAt: Date,
    connection: Pool | PoolConnection = this.pool,
  ) {
    await this.scheduler.schedule(
      {
        userId: ownerId,
        type: "HEALTH_REMINDER_DUE",
        title,
        body: `${petName}: ${title}`,
        data: { reminderId },
        scheduledAt: notifyAt,
        dedupeKey: `health-reminder:${reminderId}`,
      },
      connection,
    );
  }

  private async syncAppointmentReminder(
    appointment: Appointment,
    connection: Pool | PoolConnection = this.pool,
  ) {
    const ownerId = await this.petOwner(appointment.petId, connection);
    if (!ownerId) return;
    const dueAt = new Date(appointment.appointmentDate);
    const notifyAt = new Date(
      dueAt.getTime() - appointment.reminderMinutesBefore * 60 * 1000,
    );
    const existing = await connection.query<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM health_reminders
        WHERE source_type = 'APPOINTMENT' AND source_id = ? AND owner_id = ?
        LIMIT 1`,
      [appointment.id, ownerId],
    );
    const reminderId = existing[0][0]?.id;
    const title = `Appointment at ${appointment.clinic.name}`;
    if (reminderId) {
      await connection.query(
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
        connection,
      );
      return;
    }
    await this.createLinkedReminder(
      {
        ownerId,
        petId: appointment.petId,
        clinicId: appointment.clinic.id,
        sourceType: "APPOINTMENT",
        sourceId: appointment.id,
        title,
        notes: appointment.reason,
        dueAt,
        notifyAt,
      },
      connection,
    );
  }

  private async cancelAppointmentReminder(
    appointmentId: string,
    completed = false,
    connection: Pool | PoolConnection = this.pool,
  ) {
    const [rows] = await connection.query<(RowDataPacket & { id: string })[]>(
      `SELECT id FROM health_reminders
        WHERE source_type = 'APPOINTMENT' AND source_id = ?
        LIMIT 1`,
      [appointmentId],
    );
    const reminderId = rows[0]?.id;
    if (!reminderId) return;
    await connection.query(
      `UPDATE health_reminders
          SET status = ?, completed_at = ?
        WHERE id = ?`,
      [
        completed ? "COMPLETED" : "CANCELLED",
        completed ? new Date() : null,
        reminderId,
      ],
    );
    await this.scheduler.cancel(`health-reminder:${reminderId}`, connection);
  }

  private async audit(
    entityType: string,
    entityId: string,
    action: string,
    performedBy: string,
    details: Record<string, unknown>,
    connection: Pool | PoolConnection = this.pool,
  ) {
    await connection.query(
      `INSERT INTO audit_logs (
        entity_type, entity_id, action, performed_by, details
      ) VALUES (?, ?, ?, ?, ?)`,
      [entityType, entityId, action, performedBy, JSON.stringify(details)],
    );
  }
}
