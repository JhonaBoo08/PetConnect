import { randomUUID } from "node:crypto";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  FinderEncounterType,
  FinderLocationSource,
  FinderRiskState,
  FinderSightingInput,
  FinderSubmissionResult,
  LostReport,
  LostReportInput,
  NearbyLostReport,
  PublicActiveReport,
  RecoveryContactEvent,
  Sighting,
} from "../../../shared/contracts.js";
import { FinderEvidence } from "./finder-evidence.js";
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
  encounter_type: FinderEncounterType;
  notes: string | null;
  location_text: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  accuracy_m: string | number | null;
  location_source: FinderLocationSource;
  contact_share_consent: number;
  phone_verified_snapshot: number;
  risk_state: FinderRiskState;
  created_at: Date;
};

type RecoveryContactRow = RowDataPacket & {
  id: string;
  pet_id: string;
  pet_name: string;
  owner_id: string;
  finder_name: string | null;
  finder_contact: string | null;
  encounter_type: FinderEncounterType;
  contact_share_consent: number;
  phone_verified_snapshot: number;
  notes: string | null;
  location_text: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  accuracy_m: string | number | null;
  location_source: Exclude<FinderLocationSource, "LEGACY">;
  risk_state: FinderRiskState;
  created_at: Date;
};

export type FinderSubmissionContext = {
  finderSessionId: string | null;
  phoneVerified: boolean;
  riskState: FinderRiskState;
  evidenceId?: string | null;
  legacy?: boolean;
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

function optionalCoordinates(input: FinderSightingInput): {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
} {
  const hasLatitude =
    input.latitude !== undefined &&
    input.latitude !== null &&
    (input.latitude as unknown) !== "";
  const hasLongitude =
    input.longitude !== undefined &&
    input.longitude !== null &&
    (input.longitude as unknown) !== "";
  if (hasLatitude !== hasLongitude) {
    throw new RecoveryNetworkValidationError(
      "Latitude and longitude must be provided together.",
    );
  }
  if (!hasLatitude) {
    return { latitude: null, longitude: null, accuracyM: null };
  }
  return {
    latitude: coordinate(input.latitude, -90, 90, "latitude"),
    longitude: coordinate(input.longitude, -180, 180, "longitude"),
    accuracyM: accuracy(input.accuracyM),
  };
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
    private finderEvidence?: FinderEvidence,
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

  async ownerOverview(ownerId: string): Promise<{
    reports: LostReport[];
    sightingsByReport: Record<string, Sighting[]>;
  }> {
    const reports = await this.listMine(ownerId);
    const activeReportIds = reports
      .filter((report) => report.status !== "REUNITED")
      .map((report) => report.id);

    const sightingsByReport = Object.fromEntries(
      activeReportIds.map((id) => [id, [] as Sighting[]]),
    ) as Record<string, Sighting[]>;

    if (activeReportIds.length === 0) {
      return { reports, sightingsByReport };
    }

    const placeholders = activeReportIds.map(() => "?").join(", ");
    const [rows] = await this.pool.query<SightingRow[]>(
      `SELECT id, report_id, finder_name, finder_contact, encounter_type,
              notes, location_text, latitude, longitude, accuracy_m,
              location_source, contact_share_consent, phone_verified_snapshot,
              risk_state, created_at
         FROM sightings
        WHERE report_id IN (${placeholders})
        ORDER BY created_at DESC`,
      activeReportIds,
    );

    const sightings = await Promise.all(
      rows.map((row) => this.toSighting(row)),
    );
    for (const sighting of sightings) {
      sightingsByReport[sighting.reportId]?.push(sighting);
    }

    return { reports, sightingsByReport };
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
      `SELECT id, report_id, finder_name, finder_contact, encounter_type,
              notes, location_text, latitude, longitude, accuracy_m,
              location_source, contact_share_consent, phone_verified_snapshot,
              risk_state, created_at
         FROM sightings
        WHERE report_id = ?
        ORDER BY created_at DESC`,
      [reportId],
    );
    return Promise.all(rows.map((row) => this.toSighting(row)));
  }

  private async toSighting(row: SightingRow): Promise<Sighting> {
    return {
      id: row.id,
      reportId: row.report_id,
      encounterType: row.encounter_type || "SEEN",
      finderName: row.finder_name,
      finderContact: row.contact_share_consent ? row.finder_contact : null,
      contactShared: Boolean(row.contact_share_consent),
      phoneVerified: Boolean(row.phone_verified_snapshot),
      notes: row.notes || "",
      locationText: row.location_text || "",
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
      locationSource: row.location_source || "LEGACY",
      riskState: row.risk_state || "ACCEPTED",
      evidence: this.finderEvidence
        ? await this.finderEvidence.listForSighting(row.id)
        : [],
      createdAt: row.created_at.toISOString(),
    };
  }

  async getRecoveryContactEvent(
    ownerId: string,
    eventId: string,
  ): Promise<RecoveryContactEvent | null> {
    const [rows] = await this.pool.query<RecoveryContactRow[]>(
      `SELECT rce.*, p.name AS pet_name
         FROM recovery_contact_events rce
         JOIN pets p ON p.id = rce.pet_id
        WHERE rce.id = ? AND rce.owner_id = ?
        LIMIT 1`,
      [eventId, ownerId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      petName: row.pet_name,
      encounterType: row.encounter_type,
      finderName: row.finder_name,
      finderContact: row.contact_share_consent ? row.finder_contact : null,
      contactShared: Boolean(row.contact_share_consent),
      phoneVerified: Boolean(row.phone_verified_snapshot),
      notes: row.notes || "",
      locationText: row.location_text || "",
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
      locationSource: row.location_source,
      riskState: row.risk_state,
      evidence: this.finderEvidence
        ? await this.finderEvidence.listForContact(row.id)
        : [],
      createdAt: row.created_at.toISOString(),
    };
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
    const result = await this.submitFinderReport(
      petId,
      { ...input, encounterType: input.encounterType || "SEEN" },
      {
        finderSessionId: null,
        phoneVerified: false,
        riskState: "ACCEPTED",
        legacy: true,
      },
    );
    return result?.kind === "SIGHTING" ? result.sighting : null;
  }

  async findFinderSubmission(
    petId: string,
    finderSessionId: string,
    idempotencyKeyInput: unknown,
  ): Promise<FinderSubmissionResult | null> {
    const idempotencyKey = text(idempotencyKeyInput, 64);
    if (!idempotencyKey) return null;
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
      throw new RecoveryNetworkValidationError(
        "Invalid submission idempotency key.",
      );
    }
    const [existingSightings] = await this.pool.query<
      (SightingRow & { pet_id: string })[]
    >(
      `SELECT s.id, s.report_id, s.finder_name, s.finder_contact,
              s.encounter_type, s.notes, s.location_text, s.latitude,
              s.longitude, s.accuracy_m, s.location_source,
              s.contact_share_consent, s.phone_verified_snapshot,
              s.risk_state, s.created_at, lr.pet_id
         FROM sightings s
         JOIN lost_reports lr ON lr.id = s.report_id
        WHERE s.finder_session_id = ? AND s.idempotency_key = ?
        LIMIT 1`,
      [finderSessionId, idempotencyKey],
    );
    if (existingSightings[0]) {
      if (existingSightings[0].pet_id !== petId) {
        throw new RecoveryNetworkConflictError(
          "This submission key was already used for another pet.",
        );
      }
      return {
        kind: "SIGHTING",
        sighting: await this.toSighting(existingSightings[0]),
      };
    }
    const [existingContacts] = await this.pool.query<RecoveryContactRow[]>(
      `SELECT rce.*, p.name AS pet_name
         FROM recovery_contact_events rce
         JOIN pets p ON p.id = rce.pet_id
        WHERE rce.finder_session_id = ? AND rce.idempotency_key = ?
        LIMIT 1`,
      [finderSessionId, idempotencyKey],
    );
    if (existingContacts[0]) {
      if (existingContacts[0].pet_id !== petId) {
        throw new RecoveryNetworkConflictError(
          "This submission key was already used for another pet.",
        );
      }
      const row = existingContacts[0];
      return {
        kind: "RECOVERY_CONTACT",
        event: {
          id: row.id,
          petName: row.pet_name,
          encounterType: row.encounter_type,
          finderName: row.finder_name,
          finderContact: row.contact_share_consent ? row.finder_contact : null,
          contactShared: Boolean(row.contact_share_consent),
          phoneVerified: Boolean(row.phone_verified_snapshot),
          notes: row.notes || "",
          locationText: row.location_text || "",
          latitude: row.latitude === null ? null : Number(row.latitude),
          longitude: row.longitude === null ? null : Number(row.longitude),
          accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
          locationSource: row.location_source,
          riskState: row.risk_state,
          evidence: this.finderEvidence
            ? await this.finderEvidence.listForContact(row.id)
            : [],
          createdAt: row.created_at.toISOString(),
        },
      };
    }
    return null;
  }

  async submitFinderReport(
    petId: string,
    input: FinderSightingInput,
    context: FinderSubmissionContext,
  ): Promise<FinderSubmissionResult | null> {
    const encounterType: FinderEncounterType =
      input.encounterType === "HAVE_PET" ? "HAVE_PET" : "SEEN";
    const finderName = text(input.finderName, 80);
    const finderContact = text(input.finderContact, 120);
    const notes = text(input.notes, 2000);
    const locationText = text(input.locationText, 255);
    const coordinates = optionalCoordinates(input);
    const hasCoordinates =
      coordinates.latitude !== null && coordinates.longitude !== null;
    if (!hasCoordinates && !locationText) {
      throw new RecoveryNetworkValidationError(
        "Share your location or describe where you encountered the pet.",
      );
    }
    const locationSource: Exclude<FinderLocationSource, "LEGACY"> =
      hasCoordinates
        ? input.locationSource === "MAP"
          ? "MAP"
          : "GPS"
        : locationText
          ? "TEXT"
          : "NONE";
    // Legacy clients historically submitted finderContact directly. Preserve
    // that behavior only for the backward-compatible legacy path; new finder
    // sessions require explicit shareContact consent.
    const contactShared = Boolean(
      finderContact && (context.legacy || input.shareContact),
    );
    const idempotencyKey = text(input.idempotencyKey, 64);
    if (idempotencyKey && !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
      throw new RecoveryNetworkValidationError(
        "Invalid submission idempotency key.",
      );
    }
    if (encounterType === "HAVE_PET" && !context.evidenceId) {
      throw new RecoveryNetworkValidationError(
        "A current pet photo is required when you have the pet with you.",
      );
    }
    if (context.riskState === "BLOCKED") {
      throw new RecoveryNetworkConflictError(
        "This finder session cannot submit reports right now.",
      );
    }

    if (context.finderSessionId && idempotencyKey) {
      const existing = await this.findFinderSubmission(
        petId,
        context.finderSessionId,
        idempotencyKey,
      );
      if (existing) return existing;
    }

    const connection = await this.pool.getConnection();
    let ownerId = "";
    let reportId = "";
    let petName = "";
    let sightingId = "";
    let contactEventId = "";
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
        if (context.legacy) {
          await connection.rollback();
          return null;
        }
        const [pets] = await connection.query<
          (RowDataPacket & {
            owner_id: string;
            pet_name: string;
          })[]
        >(
          `SELECT p.owner_id, p.name AS pet_name
             FROM pets p
             JOIN users u ON u.id = p.owner_id
            WHERE p.id = ? AND u.status = 'ACTIVE'
            LIMIT 1 FOR UPDATE`,
          [petId],
        );
        const pet = pets[0];
        if (!pet) {
          await connection.rollback();
          return null;
        }
        ownerId = pet.owner_id;
        petName = pet.pet_name;
        contactEventId = `RC-${randomUUID().toUpperCase()}`;
        await connection.query(
          `INSERT INTO recovery_contact_events (
             id, pet_id, owner_id, finder_session_id, encounter_type,
             finder_name, finder_contact, contact_share_consent,
             phone_verified_snapshot, notes, location_text, latitude, longitude,
             accuracy_m, location_source, risk_state, idempotency_key
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            contactEventId,
            petId,
            ownerId,
            context.finderSessionId,
            encounterType,
            finderName || null,
            contactShared ? finderContact : null,
            contactShared ? 1 : 0,
            context.phoneVerified ? 1 : 0,
            notes || null,
            locationText || null,
            coordinates.latitude,
            coordinates.longitude,
            coordinates.accuracyM,
            locationSource,
            context.riskState,
            idempotencyKey || null,
          ],
        );
        if (context.evidenceId) {
          const [attach] = await connection.query<ResultSetHeader>(
            `UPDATE sighting_evidence
                SET recovery_contact_event_id = ?, status = 'ATTACHED',
                    expires_at = NULL
              WHERE id = ? AND pet_id = ? AND finder_session_id = ?
                AND status = 'STAGED'
                AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())`,
            [
              contactEventId,
              context.evidenceId,
              petId,
              context.finderSessionId,
            ],
          );
          if (attach.affectedRows !== 1) {
            throw new RecoveryNetworkConflictError(
              "The finder photo is unavailable or belongs to another session.",
            );
          }
        }
        await connection.commit();
      } else {
        ownerId = report.owner_id;
        reportId = report.id;
        petName = report.pet_name;
        sightingId = `SG-${randomUUID().toUpperCase()}`;
        await connection.query(
          `INSERT INTO sightings (
             id, report_id, finder_session_id, encounter_type, finder_name,
             finder_contact, notes, location_text, latitude, longitude,
             accuracy_m, location_source, contact_share_consent,
             phone_verified_snapshot, risk_state, idempotency_key
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sightingId,
            reportId,
            context.finderSessionId,
            encounterType,
            finderName || null,
            contactShared ? finderContact : null,
            notes || null,
            locationText || null,
            coordinates.latitude,
            coordinates.longitude,
            coordinates.accuracyM,
            context.legacy ? "LEGACY" : locationSource,
            contactShared ? 1 : 0,
            context.phoneVerified ? 1 : 0,
            context.riskState,
            idempotencyKey || null,
          ],
        );
        if (context.evidenceId) {
          const [attach] = await connection.query<ResultSetHeader>(
            `UPDATE sighting_evidence
                SET sighting_id = ?, status = 'ATTACHED', expires_at = NULL
              WHERE id = ? AND pet_id = ? AND finder_session_id = ?
                AND status = 'STAGED'
                AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())`,
            [sightingId, context.evidenceId, petId, context.finderSessionId],
          );
          if (attach.affectedRows !== 1) {
            throw new RecoveryNetworkConflictError(
              "The finder photo is unavailable or belongs to another session.",
            );
          }
        }

        if (hasCoordinates) {
          await connection.query(
            `UPDATE lost_reports
                SET status = 'SIGHTED',
                    last_known_latitude = ?,
                    last_known_longitude = ?,
                    last_known_accuracy_m = ?,
                    last_sighted_at = CURRENT_TIMESTAMP
              WHERE id = ? AND status IN ('LOST', 'SIGHTED')`,
            [
              coordinates.latitude,
              coordinates.longitude,
              coordinates.accuracyM,
              reportId,
            ],
          );
        } else {
          await connection.query(
            `UPDATE lost_reports
                SET status = 'SIGHTED',
                    last_sighted_at = CURRENT_TIMESTAMP
              WHERE id = ? AND status IN ('LOST', 'SIGHTED')`,
            [reportId],
          );
        }
        await connection.commit();
      }
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }

    if (reportId) {
      await this.notifications.notifyUser(
        ownerId,
        encounterType === "HAVE_PET" ? "PET_FOUND" : "PET_SIGHTED",
        encounterType === "HAVE_PET"
          ? `A finder says they have ${petName}`
          : `${petName} was sighted`,
        encounterType === "HAVE_PET"
          ? "A finder submitted a found-pet report with PetConnect."
          : "A finder submitted a new PetConnect sighting.",
        {
          reportId,
          sightingId,
          petName,
          encounterType,
          evidenceAttached: Boolean(context.evidenceId),
        },
      );
      const [rows] = await this.pool.query<SightingRow[]>(
        `SELECT id, report_id, finder_name, finder_contact, encounter_type,
                notes, location_text, latitude, longitude, accuracy_m,
                location_source, contact_share_consent,
                phone_verified_snapshot, risk_state, created_at
           FROM sightings
          WHERE id = ?
          LIMIT 1`,
        [sightingId],
      );
      return {
        kind: "SIGHTING",
        sighting: await this.toSighting(rows[0]),
      };
    }

    await this.notifications.notifyUser(
      ownerId,
      "PET_QR_FOUND",
      `Someone says they found ${petName}`,
      "A finder used the PetConnect recovery QR to contact you.",
      {
        recoveryContactEventId: contactEventId,
        petName,
        encounterType,
        evidenceAttached: Boolean(context.evidenceId),
      },
    );
    const event = await this.getRecoveryContactEvent(ownerId, contactEventId);
    if (!event) {
      throw new Error("Created recovery contact could not be loaded.");
    }
    return { kind: "RECOVERY_CONTACT", event };
  }
}
