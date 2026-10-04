import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { SightingEvidence } from "../../../shared/contracts.js";

export class FinderEvidenceError extends Error {}

export type StoredFinderPhoto = {
  relativeUrl: string;
  absolutePath: string;
  mimeType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

type EvidenceRow = RowDataPacket & {
  id: string;
  pet_id: string;
  finder_session_id: string;
  sighting_id: string | null;
  recovery_contact_event_id: string | null;
  storage_url: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  status: "STAGED" | "ATTACHED" | "DELETED";
  expires_at: Date | null;
  created_at: Date;
};

function publicEvidence(row: EvidenceRow): SightingEvidence {
  return {
    id: row.id,
    // This is an authenticated API route, not the backing filesystem path.
    url: `/v1/finder-evidence/${encodeURIComponent(row.id)}/file`,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    width: Number(row.width),
    height: Number(row.height),
    createdAt: row.created_at.toISOString(),
  };
}

export class FinderEvidence {
  private retentionHours: number;
  private incidentRetentionDays: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private pool: Pool,
    private uploadDir: string,
    retentionHours = 24,
    incidentRetentionDays = 30,
  ) {
    this.retentionHours = Math.max(
      1,
      Math.min(72, Math.floor(retentionHours || 24)),
    );
    this.incidentRetentionDays = Math.max(
      1,
      Math.min(365, Math.floor(incidentRetentionDays || 30)),
    );
  }

  async stage(
    petId: string,
    finderSessionId: string,
    photo: StoredFinderPhoto,
  ): Promise<{ evidence: SightingEvidence; expiresAt: string }> {
    await this.cleanupExpired();
    const id = `EV-${randomUUID().toUpperCase()}`;
    const expiresAt = new Date(
      Date.now() + this.retentionHours * 60 * 60 * 1000,
    );
    try {
      await this.pool.query(
        `INSERT INTO sighting_evidence (
           id, pet_id, finder_session_id, storage_url, mime_type,
           byte_size, width, height, sha256, status, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'STAGED', ?)`,
        [
          id,
          petId,
          finderSessionId,
          photo.relativeUrl,
          photo.mimeType,
          photo.byteSize,
          photo.width,
          photo.height,
          photo.sha256,
          expiresAt.toISOString().slice(0, 19).replace("T", " "),
        ],
      );
    } catch (error) {
      await fs.unlink(photo.absolutePath).catch(() => {});
      throw error;
    }
    return {
      evidence: {
        id,
        url: "",
        mimeType: photo.mimeType,
        byteSize: photo.byteSize,
        width: photo.width,
        height: photo.height,
        sha256: photo.sha256,
        createdAt: new Date().toISOString(),
      },
      expiresAt: expiresAt.toISOString(),
    };
  }

  async ownedStaged(
    evidenceId: string | undefined,
    petId: string,
    finderSessionId: string,
  ): Promise<EvidenceRow | null> {
    if (!evidenceId) return null;
    const [rows] = await this.pool.query<EvidenceRow[]>(
      `SELECT *
         FROM sighting_evidence
        WHERE id = ?
          AND pet_id = ?
          AND finder_session_id = ?
          AND status = 'STAGED'
          AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
        LIMIT 1`,
      [evidenceId, petId, finderSessionId],
    );
    return rows[0] || null;
  }

  async attachToSighting(
    evidenceId: string,
    sightingId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE sighting_evidence
          SET sighting_id = ?, status = 'ATTACHED', expires_at = NULL
        WHERE id = ? AND status = 'STAGED'`,
      [sightingId, evidenceId],
    );
  }

  async attachToContact(evidenceId: string, eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE sighting_evidence
          SET recovery_contact_event_id = ?, status = 'ATTACHED', expires_at = NULL
        WHERE id = ? AND status = 'STAGED'`,
      [eventId, evidenceId],
    );
  }

  async listForSighting(sightingId: string): Promise<SightingEvidence[]> {
    const [rows] = await this.pool.query<EvidenceRow[]>(
      `SELECT *
         FROM sighting_evidence
        WHERE sighting_id = ? AND status = 'ATTACHED'
        ORDER BY created_at ASC`,
      [sightingId],
    );
    return rows.map(publicEvidence);
  }

  async listForContact(eventId: string): Promise<SightingEvidence[]> {
    const [rows] = await this.pool.query<EvidenceRow[]>(
      `SELECT *
         FROM sighting_evidence
        WHERE recovery_contact_event_id = ? AND status = 'ATTACHED'
        ORDER BY created_at ASC`,
      [eventId],
    );
    return rows.map(publicEvidence);
  }

  async ownerFile(
    evidenceId: string,
    ownerId: string,
  ): Promise<{ absolutePath: string; mimeType: string } | null> {
    const [rows] = await this.pool.query<EvidenceRow[]>(
      `SELECT se.*
         FROM sighting_evidence se
         JOIN pets p ON p.id = se.pet_id
        WHERE se.id = ? AND p.owner_id = ? AND se.status = 'ATTACHED'
        LIMIT 1`,
      [evidenceId, ownerId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      absolutePath: this.absolutePath(row.storage_url),
      mimeType: row.mime_type,
    };
  }

  private absolutePath(storageUrl: string): string {
    const relative = storageUrl
      .replace(/^\/uploads\//, "")
      .replaceAll("/", path.sep);
    const resolved = path.resolve(this.uploadDir, relative);
    const root = path.resolve(this.uploadDir) + path.sep;
    if (!resolved.startsWith(root)) {
      throw new FinderEvidenceError("Invalid evidence storage path.");
    }
    return resolved;
  }

  async cleanupExpired(): Promise<void> {
    const [staged] = await this.pool.query<EvidenceRow[]>(
      `SELECT *
         FROM sighting_evidence
        WHERE status = 'STAGED'
          AND expires_at IS NOT NULL
          AND expires_at <= UTC_TIMESTAMP()
        LIMIT 100`,
    );
    for (const row of staged) {
      await this.deleteStoredEvidence(row);
    }

    const retentionDays = this.incidentRetentionDays;
    const [retained] = await this.pool.query<EvidenceRow[]>(
      `SELECT se.*
         FROM sighting_evidence se
         LEFT JOIN sightings s ON s.id = se.sighting_id
         LEFT JOIN lost_reports lr ON lr.id = s.report_id
         LEFT JOIN recovery_contact_events rce
           ON rce.id = se.recovery_contact_event_id
        WHERE se.status = 'ATTACHED'
          AND (
            (
              lr.status = 'REUNITED'
              AND lr.reunited_at IS NOT NULL
              AND lr.reunited_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
            )
            OR
            (
              rce.id IS NOT NULL
              AND rce.created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
            )
          )
        LIMIT 100`,
      [retentionDays, retentionDays],
    );
    for (const row of retained) {
      await this.deleteStoredEvidence(row);
    }

    // Retain the minimal recovery event/audit trail, but remove finder contact
    // and exact location after the documented recovery retention window.
    await this.pool.query(
      `UPDATE sightings s
       JOIN lost_reports lr ON lr.id = s.report_id
          SET s.finder_name = NULL,
              s.finder_contact = NULL,
              s.notes = NULL,
              s.location_text = NULL,
              s.latitude = NULL,
              s.longitude = NULL,
              s.accuracy_m = NULL
        WHERE lr.status = 'REUNITED'
          AND lr.reunited_at IS NOT NULL
          AND lr.reunited_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    await this.pool.query(
      `UPDATE lost_reports
          SET last_known_latitude = last_seen_latitude,
              last_known_longitude = last_seen_longitude,
              last_known_accuracy_m = last_seen_accuracy_m
        WHERE status = 'REUNITED'
          AND reunited_at IS NOT NULL
          AND reunited_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    await this.pool.query(
      `UPDATE recovery_contact_events
          SET finder_name = NULL,
              finder_contact = NULL,
              notes = NULL,
              location_text = NULL,
              latitude = NULL,
              longitude = NULL,
              accuracy_m = NULL
        WHERE created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    await this.pool.query(
      `UPDATE notifications n
       JOIN lost_reports lr
         ON lr.id = JSON_UNQUOTE(JSON_EXTRACT(n.data, '$.reportId'))
          SET n.body = 'Finder details removed after the retention period.'
        WHERE n.type IN ('PET_SIGHTED', 'PET_FOUND')
          AND n.user_id = lr.owner_id
          AND lr.status = 'REUNITED'
          AND lr.reunited_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    await this.pool.query(
      `UPDATE notifications n
       JOIN recovery_contact_events rce
         ON rce.id = JSON_UNQUOTE(JSON_EXTRACT(n.data, '$.recoveryContactEventId'))
          SET n.body = 'Finder details removed after the retention period.'
        WHERE n.type = 'PET_QR_FOUND'
          AND n.user_id = rce.owner_id
          AND rce.created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    await this.pool.query(
      `DELETE FROM finder_otp_challenges
        WHERE expires_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
        LIMIT 500`,
    );
  }

  private async deleteStoredEvidence(row: EvidenceRow): Promise<void> {
    await fs
      .unlink(this.absolutePath(row.storage_url))
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    await this.pool.query(
      `UPDATE sighting_evidence
          SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('STAGED', 'ATTACHED')`,
      [row.id],
    );
  }

  start(intervalMs = 60 * 60 * 1000): void {
    if (this.timer) return;
    const run = () => {
      void this.cleanupExpired().catch((error) =>
        console.error("Finder evidence cleanup failed:", error),
      );
    };
    run();
    this.timer = setInterval(run, Math.max(60_000, intervalMs));
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
