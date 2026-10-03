import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  FinderSightingInput,
  LostReport,
  LostReportInput,
  NearbyLostReport,
  PublicActiveReport,
  Sighting,
} from "../../../shared/contracts.js";
import { Notifications } from "./notifications.js";

type ReportRow = RowDataPacket & {
  id: string;
  pet_id: string;
  pet_name: string;
  species: string;
  breed: string | null;
  photo_url: string | null;
  owner_id: string;
  status: "LOST" | "SIGHTED" | "REUNITED";
  last_seen_text: string;
  details: string | null;
  last_seen_latitude: string | number;
  last_seen_longitude: string | number;
  last_known_latitude: string | number;
  last_known_longitude: string | number;
  last_known_accuracy_m: string | number | null;
  reported_at: Date;
  last_sighted_at: Date | null;
  reunited_at: Date | null;
  sighting_count: number | string;
  distance_km?: number | string;
  share_precise_recovery_location?: number;
};

function publicCoordinate(value: string | number, precise: boolean): number {
  const coordinate = Number(value);
  return precise ? coordinate : Math.round(coordinate * 1000) / 1000;
}

function publicAccuracy(
  value: string | number | null,
  precise: boolean,
): number | null {
  if (precise) return value === null ? null : Number(value);
  const reported = value === null ? 0 : Number(value);
  return Math.max(150, reported);
}

type SightingRow = RowDataPacket & {
  id: string;
  report_id: string;
  finder_name: string | null;
  finder_contact: string | null;
  notes: string | null;
  latitude: string | number;
  longitude: string | number;
  accuracy_m: string | number | null;
  created_at: Date;
};

export class RecoveryNetworkValidationError extends Error {}
export class RecoveryNetworkConflictError extends Error {}

function text(value: unknown, max: number, required = false) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) {
    throw new RecoveryNetworkValidationError(
      "A location description is required.",
    );
  }
  if (normalized.length > max) {
    throw new RecoveryNetworkValidationError(
      `Text must be at most ${max} characters.`,
    );
  }
  return normalized;
}

function coordinate(value: unknown, min: number, max: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new RecoveryNetworkValidationError(`Invalid ${label}.`);
  }
  return number;
}

function accuracy(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000) {
    throw new RecoveryNetworkValidationError("Invalid location accuracy.");
  }
  return number;
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function toReport(row: ReportRow): LostReport {
  return {
    id: row.id,
    petId: row.pet_id,
    petName: row.pet_name,
    petSpecies: row.species,
    petBreed: row.breed || "",
    petPhotoUrl: row.photo_url,
    status: row.status,
    lastSeenText: row.last_seen_text,
    details: row.details || "",
    lastSeenLatitude: Number(row.last_seen_latitude),
    lastSeenLongitude: Number(row.last_seen_longitude),
    lastKnownLatitude: Number(row.last_known_latitude),
    lastKnownLongitude: Number(row.last_known_longitude),
    lastKnownAccuracyM:
      row.last_known_accuracy_m === null
        ? null
        : Number(row.last_known_accuracy_m),
    reportedAt: row.reported_at.toISOString(),
    lastSightedAt: iso(row.last_sighted_at),
    reunitedAt: iso(row.reunited_at),
    sightingCount: Number(row.sighting_count),
  };
}

const reportSelect = `
  SELECT lr.id, lr.pet_id, lr.owner_id, lr.status, lr.last_seen_text,
         lr.details, lr.last_seen_latitude, lr.last_seen_longitude,
         lr.last_known_latitude, lr.last_known_longitude,
         lr.last_known_accuracy_m, lr.reported_at, lr.last_sighted_at,
         lr.reunited_at, p.name AS pet_name, p.species, p.breed, p.photo_url,
         u.share_precise_recovery_location,
         (SELECT COUNT(*) FROM sightings s WHERE s.report_id = lr.id) AS sighting_count
    FROM lost_reports lr
    JOIN pets p ON p.id = lr.pet_id
    JOIN users u ON u.id = lr.owner_id
`;

export class RecoveryNetwork {
  constructor(
    private pool: Pool,
    private notifications: Notifications,
  ) {}

  async create(ownerId: string, input: LostReportInput): Promise<LostReport> {
    const petId = text(input.petId, 64, true);
    const lastSeenText = text(input.lastSeenText, 255, true);
    const details = text(input.details, 2000);
    const latitude = coordinate(input.latitude, -90, 90, "latitude");
    const longitude = coordinate(input.longitude, -180, 180, "longitude");
    const accuracyM = accuracy(input.accuracyM);

    const [pets] = await this.pool.query<
      (RowDataPacket & { share_precise_recovery_location: number })[]
    >(
      `SELECT p.id, p.name, u.share_precise_recovery_location
         FROM pets p
         JOIN users u ON u.id = p.owner_id
        WHERE p.id = ? AND p.owner_id = ?
        LIMIT 1`,
      [petId, ownerId],
    );
    if (!pets[0]) {
      throw new RecoveryNetworkConflictError("Pet not found.");
    }

    const id = `LR-${randomUUID().toUpperCase()}`;
    try {
      await this.pool.query(
        `INSERT INTO lost_reports (
          id, pet_id, owner_id, status, last_seen_text, details,
          last_seen_latitude, last_seen_longitude, last_seen_accuracy_m,
          last_known_latitude, last_known_longitude, last_known_accuracy_m
        ) VALUES (?, ?, ?, 'LOST', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          petId,
          ownerId,
          lastSeenText,
          details || null,
          latitude,
          longitude,
          accuracyM,
          latitude,
          longitude,
          accuracyM,
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        throw new RecoveryNetworkConflictError(
          "This pet already has an active lost report.",
        );
      }
      throw error;
    }

    const report = (await this.getOwnerReport(ownerId, id))!;
    const precise = Boolean(pets[0].share_precise_recovery_location);
    const notificationLatitude = publicCoordinate(latitude, precise);
    const notificationLongitude = publicCoordinate(longitude, precise);
    const radiusKm = Math.max(
      1,
      Math.min(50, Number(process.env.RECOVERY_ALERT_RADIUS_KM) || 10),
    );
    await this.notifications.notifyNearby(
      latitude,
      longitude,
      radiusKm,
      ownerId,
      "LOST_PET_NEARBY",
      `${report.petName} is missing nearby`,
      `Last seen: ${lastSeenText}`,
      {
        reportId: id,
        petName: report.petName,
        latitude: notificationLatitude,
        longitude: notificationLongitude,
        accuracyM: publicAccuracy(accuracyM, precise),
      },
    );
    return report;
  }

  async listMine(ownerId: string): Promise<LostReport[]> {
    const [rows] = await this.pool.query<ReportRow[]>(
      reportSelect +
        ` WHERE lr.owner_id = ?
          ORDER BY FIELD(lr.status, 'SIGHTED', 'LOST', 'REUNITED'), lr.updated_at DESC`,
      [ownerId],
    );
    return rows.map(toReport);
  }

  async getOwnerReport(
    ownerId: string,
    id: string,
  ): Promise<LostReport | null> {
    const [rows] = await this.pool.query<ReportRow[]>(
      reportSelect + " WHERE lr.id = ? AND lr.owner_id = ? LIMIT 1",
      [id, ownerId],
    );
    return rows[0] ? toReport(rows[0]) : null;
  }

  async listSightings(
    ownerId: string,
    reportId: string,
  ): Promise<Sighting[] | null> {
    if (!(await this.getOwnerReport(ownerId, reportId))) return null;
    const [rows] = await this.pool.query<SightingRow[]>(
      `SELECT id, report_id, finder_name, finder_contact, notes,
              latitude, longitude, accuracy_m, created_at
         FROM sightings
        WHERE report_id = ?
        ORDER BY created_at DESC`,
      [reportId],
    );
    return rows.map((row) => ({
      id: row.id,
      reportId: row.report_id,
      finderName: row.finder_name,
      finderContact: row.finder_contact,
      notes: row.notes || "",
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
      createdAt: row.created_at.toISOString(),
    }));
  }

  async markReunited(
    ownerId: string,
    reportId: string,
  ): Promise<LostReport | null> {
    const [result] = await this.pool.query(
      `UPDATE lost_reports
          SET status = 'REUNITED',
              reunited_at = CURRENT_TIMESTAMP
        WHERE id = ? AND owner_id = ? AND status IN ('LOST', 'SIGHTED')`,
      [reportId, ownerId],
    );
    if (Number((result as { affectedRows?: number }).affectedRows || 0) === 0) {
      return this.getOwnerReport(ownerId, reportId);
    }
    return this.getOwnerReport(ownerId, reportId);
  }

  async publicActiveForPet(petId: string): Promise<PublicActiveReport | null> {
    const [rows] = await this.pool.query<ReportRow[]>(
      reportSelect +
        " WHERE lr.pet_id = ? AND lr.status IN ('LOST', 'SIGHTED') LIMIT 1",
      [petId],
    );
    const row = rows[0];
    if (!row) return null;
    const precise = Boolean(row.share_precise_recovery_location);
    return {
      status: row.status as "LOST" | "SIGHTED",
      lastSeenText: row.last_seen_text,
      details: row.details || "",
      latitude: publicCoordinate(row.last_known_latitude, precise),
      longitude: publicCoordinate(row.last_known_longitude, precise),
      accuracyM: publicAccuracy(row.last_known_accuracy_m, precise),
      reportedAt: row.reported_at.toISOString(),
      lastSightedAt: iso(row.last_sighted_at),
      sightingCount: Number(row.sighting_count),
    };
  }

  async nearby(
    latitudeInput: unknown,
    longitudeInput: unknown,
    radiusInput: unknown,
  ): Promise<NearbyLostReport[]> {
    const latitude = coordinate(latitudeInput, -90, 90, "latitude");
    const longitude = coordinate(longitudeInput, -180, 180, "longitude");
    const radiusKm = Math.max(0.5, Math.min(50, Number(radiusInput) || 10));

    const publicLatitudeSql =
      "(CASE WHEN u.share_precise_recovery_location = 1 THEN lr.last_known_latitude ELSE FLOOR(lr.last_known_latitude * 1000 + 0.5) / 1000 END)";
    const publicLongitudeSql =
      "(CASE WHEN u.share_precise_recovery_location = 1 THEN lr.last_known_longitude ELSE FLOOR(lr.last_known_longitude * 1000 + 0.5) / 1000 END)";
    const distanceSql = `(
      6371 * ACOS(
        LEAST(
          1,
          COS(RADIANS(?)) * COS(RADIANS(${publicLatitudeSql}))
            * COS(RADIANS(${publicLongitudeSql}) - RADIANS(?))
            + SIN(RADIANS(?)) * SIN(RADIANS(${publicLatitudeSql}))
        )
      )
    )`;

    const [rows] = await this.pool.query<ReportRow[]>(
      `SELECT nearby.*, nearby.distance_km
         FROM (
          SELECT lr.id, lr.pet_id, lr.owner_id, lr.status, lr.last_seen_text,
                 lr.details, lr.last_seen_latitude, lr.last_seen_longitude,
                 lr.last_known_latitude, lr.last_known_longitude,
                 lr.last_known_accuracy_m, lr.reported_at, lr.last_sighted_at,
                 lr.reunited_at, p.name AS pet_name, p.species, p.breed, p.photo_url,
                 u.share_precise_recovery_location,
                 (SELECT COUNT(*) FROM sightings s WHERE s.report_id = lr.id) AS sighting_count,
                 ${distanceSql} AS distance_km
            FROM lost_reports lr
            JOIN pets p ON p.id = lr.pet_id
            JOIN users u ON u.id = lr.owner_id
           WHERE lr.status IN ('LOST', 'SIGHTED')
         ) nearby
        WHERE nearby.distance_km <= ?
        ORDER BY nearby.distance_km ASC, nearby.reported_at DESC
        LIMIT 100`,
      [latitude, longitude, latitude, radiusKm],
    );

    return rows.map((row) => {
      const precise = Boolean(row.share_precise_recovery_location);
      const exactDistance = Number(row.distance_km);
      return {
        id: row.id,
        petName: row.pet_name,
        petSpecies: row.species,
        petBreed: row.breed || "",
        petPhotoUrl: row.photo_url,
        status: row.status as "LOST" | "SIGHTED",
        lastSeenText: row.last_seen_text,
        details: row.details || "",
        latitude: publicCoordinate(row.last_known_latitude, precise),
        longitude: publicCoordinate(row.last_known_longitude, precise),
        accuracyM: publicAccuracy(row.last_known_accuracy_m, precise),
        reportedAt: row.reported_at.toISOString(),
        lastSightedAt: iso(row.last_sighted_at),
        distanceKm: precise ? exactDistance : Math.round(exactDistance * 2) / 2,
        sightingCount: Number(row.sighting_count),
      };
    });
  }

  async submitSighting(
    petId: string,
    input: FinderSightingInput,
  ): Promise<Sighting | null> {
    const finderName = text(input.finderName, 80);
    const finderContact = text(input.finderContact, 120);
    const notes = text(input.notes, 2000);
    const latitude = coordinate(input.latitude, -90, 90, "latitude");
    const longitude = coordinate(input.longitude, -180, 180, "longitude");
    const accuracyM = accuracy(input.accuracyM);

    const connection = await this.pool.getConnection();
    let ownerId = "";
    let reportId = "";
    let petName = "";
    let sightingId = "";
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<ReportRow[]>(
        reportSelect +
          ` WHERE lr.pet_id = ? AND lr.status IN ('LOST', 'SIGHTED')
             LIMIT 1 FOR UPDATE`,
        [petId],
      );
      const report = rows[0];
      if (!report) {
        await connection.rollback();
        return null;
      }
      ownerId = report.owner_id;
      reportId = report.id;
      petName = report.pet_name;
      sightingId = `SG-${randomUUID().toUpperCase()}`;
      await connection.query(
        `INSERT INTO sightings (
          id, report_id, finder_name, finder_contact, notes,
          latitude, longitude, accuracy_m
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sightingId,
          reportId,
          finderName || null,
          finderContact || null,
          notes || null,
          latitude,
          longitude,
          accuracyM,
        ],
      );
      await connection.query(
        `UPDATE lost_reports
            SET status = 'SIGHTED',
                last_known_latitude = ?,
                last_known_longitude = ?,
                last_known_accuracy_m = ?,
                last_sighted_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('LOST', 'SIGHTED')`,
        [latitude, longitude, accuracyM, reportId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await this.notifications.notifyUser(
      ownerId,
      "PET_SIGHTED",
      `${petName} was sighted`,
      notes || "A finder submitted a new GPS sighting.",
      { reportId, petName, latitude, longitude },
    );

    return {
      id: sightingId,
      reportId,
      finderName: finderName || null,
      finderContact: finderContact || null,
      notes,
      latitude,
      longitude,
      accuracyM,
      createdAt: new Date().toISOString(),
    };
  }
}
