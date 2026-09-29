import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Pool, RowDataPacket } from "mysql2/promise";
import type {
  PublicRecoveryProfile,
  RecoveryTokenState,
} from "../../../shared/contracts.js";

type OwnerTokenRow = RowDataPacket & {
  token_id: string | null;
  revoked_at: Date | null;
};

type PublicRecoveryRow = RowDataPacket & {
  pet_id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  age_label: string | null;
  identifying_details: string | null;
  photo_url: string | null;
  display_name: string;
  phone: string | null;
  share_recovery_phone: number;
  share_precise_recovery_location: number;
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

const tokenIdPattern = /^[a-f0-9]{32}$/;
const signaturePattern = /^[A-Za-z0-9_-]{43}$/;

export class RecoveryTokens {
  constructor(
    private pool: Pool,
    private secret: string,
    private publicAppBaseUrl: string,
  ) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("RECOVERY_TOKEN_SECRET must be at least 32 bytes.");
    }
    try {
      new URL(publicAppBaseUrl);
    } catch {
      throw new Error("PUBLIC_APP_BASE_URL must be an absolute URL.");
    }
  }

  private signature(tokenId: string): string {
    return createHmac("sha256", this.secret)
      .update(tokenId)
      .digest("base64url");
  }

  private token(tokenId: string): string {
    return `${tokenId}.${this.signature(tokenId)}`;
  }

  private tokenIdFromBearer(token: string): string | null {
    const [tokenId, signature, extra] = token.split(".");
    if (
      extra !== undefined ||
      !tokenIdPattern.test(tokenId || "") ||
      !signaturePattern.test(signature || "")
    ) {
      return null;
    }
    const expected = Buffer.from(this.signature(tokenId), "utf8");
    const provided = Buffer.from(signature, "utf8");
    return expected.length === provided.length &&
      timingSafeEqual(expected, provided)
      ? tokenId
      : null;
  }

  private state(tokenId: string, active: boolean): RecoveryTokenState {
    if (!active) return { active: false, token: null, recoveryUrl: null };
    const token = this.token(tokenId);
    const url = new URL("/recover", this.publicAppBaseUrl);
    url.searchParams.set("token", token);
    return { active: true, token, recoveryUrl: url.toString() };
  }

  private async ownerRow(
    ownerId: string,
    petId: string,
  ): Promise<OwnerTokenRow | null> {
    const [rows] = await this.pool.query<OwnerTokenRow[]>(
      `SELECT rt.token_id, rt.revoked_at
         FROM pets p
         LEFT JOIN pet_recovery_tokens rt ON rt.pet_id = p.id
        WHERE p.id = ? AND p.owner_id = ?
        LIMIT 1`,
      [petId, ownerId],
    );
    return rows[0] || null;
  }

  async getOrCreate(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTokenState | null> {
    let row = await this.ownerRow(ownerId, petId);
    if (!row) return null;
    if (!row.token_id) {
      for (let attempt = 0; attempt < 3 && !row.token_id; attempt += 1) {
        const tokenId = randomBytes(16).toString("hex");
        await this.pool.query(
          "INSERT IGNORE INTO pet_recovery_tokens (pet_id, token_id) VALUES (?, ?)",
          [petId, tokenId],
        );
        row = (await this.ownerRow(ownerId, petId))!;
      }
      if (!row.token_id) throw new Error("Could not create recovery token.");
    }
    return this.state(row.token_id, row.revoked_at === null);
  }

  async rotate(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTokenState | null> {
    if (!(await this.ownerRow(ownerId, petId))) return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const tokenId = randomBytes(16).toString("hex");
      try {
        await this.pool.query(
          `INSERT INTO pet_recovery_tokens (pet_id, token_id, revoked_at)
           VALUES (?, ?, NULL)
           ON DUPLICATE KEY UPDATE token_id = VALUES(token_id), revoked_at = NULL`,
          [petId, tokenId],
        );
        return this.state(tokenId, true);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== "ER_DUP_ENTRY" || attempt === 2) throw error;
      }
    }
    throw new Error("Could not rotate recovery token.");
  }

  async revoke(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTokenState | null> {
    const state = await this.getOrCreate(ownerId, petId);
    if (!state) return null;
    await this.pool.query(
      `UPDATE pet_recovery_tokens rt
       JOIN pets p ON p.id = rt.pet_id
          SET rt.revoked_at = CURRENT_TIMESTAMP
        WHERE rt.pet_id = ? AND p.owner_id = ?`,
      [petId, ownerId],
    );
    return { active: false, token: null, recoveryUrl: null };
  }

  async publicProfile(token: string): Promise<PublicRecoveryProfile | null> {
    const tokenId = this.tokenIdFromBearer(token);
    if (!tokenId) return null;
    const [rows] = await this.pool.query<PublicRecoveryRow[]>(
      `SELECT p.id AS pet_id, p.name, p.species, p.breed, p.sex, p.age_label,
              p.identifying_details, p.photo_url,
              u.display_name, u.phone, u.share_recovery_phone,
              u.share_precise_recovery_location
         FROM pet_recovery_tokens rt
         JOIN pets p ON p.id = rt.pet_id
         JOIN users u ON u.id = p.owner_id
        WHERE rt.token_id = ?
          AND rt.revoked_at IS NULL
          AND u.status = 'ACTIVE'
        LIMIT 1`,
      [tokenId],
    );
    const row = rows[0];
    if (!row) return null;
    const [reportRows] = await this.pool.query<
      (RowDataPacket & {
        status: "LOST" | "SIGHTED";
        last_seen_text: string;
        details: string | null;
        last_known_latitude: string | number;
        last_known_longitude: string | number;
        last_known_accuracy_m: string | number | null;
        reported_at: Date;
        last_sighted_at: Date | null;
        sighting_count: number | string;
      })[]
    >(
      `SELECT lr.status, lr.last_seen_text, lr.details,
              lr.last_known_latitude, lr.last_known_longitude,
              lr.last_known_accuracy_m, lr.reported_at, lr.last_sighted_at,
              (SELECT COUNT(*) FROM sightings s WHERE s.report_id = lr.id) AS sighting_count
         FROM lost_reports lr
        WHERE lr.pet_id = ?
          AND lr.status IN ('LOST', 'SIGHTED')
        LIMIT 1`,
      [row.pet_id],
    );
    const active = reportRows[0];
    const sharePreciseLocation = Boolean(row.share_precise_recovery_location);
    return {
      pet: {
        name: row.name,
        species: row.species,
        breed: row.breed || "",
        sex: (row.sex as PublicRecoveryProfile["pet"]["sex"]) || "",
        ageLabel: row.age_label || "",
        identifyingDetails: row.identifying_details || "",
        photoUrl: row.photo_url,
      },
      owner: {
        displayName: row.display_name,
        phone: row.share_recovery_phone ? row.phone : null,
      },
      activeReport: active
        ? {
            status: active.status,
            lastSeenText: active.last_seen_text,
            details: active.details || "",
            latitude: publicCoordinate(
              active.last_known_latitude,
              sharePreciseLocation,
            ),
            longitude: publicCoordinate(
              active.last_known_longitude,
              sharePreciseLocation,
            ),
            accuracyM: publicAccuracy(
              active.last_known_accuracy_m,
              sharePreciseLocation,
            ),
            reportedAt: active.reported_at.toISOString(),
            lastSightedAt: active.last_sighted_at
              ? active.last_sighted_at.toISOString()
              : null,
            sightingCount: Number(active.sighting_count),
          }
        : null,
    };
  }

  async resolvePetId(token: string): Promise<string | null> {
    const tokenId = this.tokenIdFromBearer(token);
    if (!tokenId) return null;
    const [rows] = await this.pool.query<
      (RowDataPacket & { pet_id: string })[]
    >(
      `SELECT rt.pet_id
         FROM pet_recovery_tokens rt
         JOIN pets p ON p.id = rt.pet_id
         JOIN users u ON u.id = p.owner_id
        WHERE rt.token_id = ?
          AND rt.revoked_at IS NULL
          AND u.status = 'ACTIVE'
        LIMIT 1`,
      [tokenId],
    );
    return rows[0]?.pet_id || null;
  }
}
