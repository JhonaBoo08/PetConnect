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

  constructor(
    private pool: Pool,
    private uploadDir: string,
    retentionHours = 24,
  ) {
    this.retentionHours = Math.max(
      1,
      Math.min(72, Math.floor(retentionHours || 24)),
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
    const [rows] = await this.pool.query<EvidenceRow[]>(
      `SELECT *
         FROM sighting_evidence
        WHERE status = 'STAGED'
          AND expires_at IS NOT NULL
          AND expires_at <= UTC_TIMESTAMP()
        LIMIT 100`,
    );
    for (const row of rows) {
      await fs.unlink(this.absolutePath(row.storage_url)).catch(() => {});
      await this.pool.query(
        `UPDATE sighting_evidence
            SET status = 'DELETED', deleted_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'STAGED'`,
        [row.id],
      );
    }
  }
}
