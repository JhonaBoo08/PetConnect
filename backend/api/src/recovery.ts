import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  PublicRecoveryProfile,
  RecoveryTag,
  RecoveryTagScan,
  RecoveryTagStatus,
  RecoveryTagType,
  RecoveryTokenState,
} from "../../../shared/contracts.js";

type OwnerTokenRow = RowDataPacket & {
  token_id: string | null;
  revoked_at: Date | null;
};

type RecoveryTagRow = RowDataPacket & {
  id: string;
  pet_id: string;
  token_id: string;
  short_code: string;
  label: string;
  tag_type: RecoveryTagType;
  status: RecoveryTagStatus;
  last_scanned_at: Date | null;
  scan_count: number | string;
  created_at: Date;
  updated_at: Date;
};

type TagResolveRow = RecoveryTagRow & {
  owner_id: string;
  pet_name: string;
};

type RecoveryScanRow = RowDataPacket & {
  id: string;
  tag_id: string;
  pet_id: string;
  label: string;
  short_code: string;
  source: "QR" | "CODE";
  created_at: Date;
};

type PublicRecoveryRow = RowDataPacket & {
  pet_id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  age_label: string | null;
  identifying_details: string | null;
  microchip_number: string | null;
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
const allowedTagTypes = new Set<RecoveryTagType>([
  "PRINT",
  "COLLAR",
  "HARNESS",
  "STICKER",
  "OTHER",
]);

function tagLabel(value: unknown): string {
  const label = String(value || "")
    .trim()
    .slice(0, 60);
  return label || "Main tag";
}

function tagType(value: unknown): RecoveryTagType {
  const normalized = String(value || "PRINT").toUpperCase() as RecoveryTagType;
  return allowedTagTypes.has(normalized) ? normalized : "OTHER";
}

function normalizeShortCode(value: string): string {
  const compact = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^PETCONNECT-/, "PC-");
  if (!compact) return "";
  return compact.startsWith("PC-") ? compact : `PC-${compact}`;
}

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

  private recoveryUrl(tokenId: string): string {
    const url = new URL("/recover", this.publicAppBaseUrl);
    url.searchParams.set("token", this.token(tokenId));
    return url.toString();
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
    return {
      active: true,
      token: this.token(tokenId),
      recoveryUrl: this.recoveryUrl(tokenId),
    };
  }

  private tagState(row: RecoveryTagRow): RecoveryTag {
    const active = row.status === "ACTIVE";
    return {
      id: row.id,
      petId: row.pet_id,
      label: row.label,
      tagType: row.tag_type,
      status: row.status,
      shortCode: row.short_code,
      token: active ? this.token(row.token_id) : null,
      recoveryUrl: active ? this.recoveryUrl(row.token_id) : null,
      lastScannedAt: row.last_scanned_at
        ? row.last_scanned_at.toISOString()
        : null,
      scanCount: Number(row.scan_count),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async ownerPet(ownerId: string, petId: string): Promise<boolean> {
    const [rows] = await this.pool.query<(RowDataPacket & { id: string })[]>(
      "SELECT id FROM pets WHERE id = ? AND owner_id = ? LIMIT 1",
      [petId, ownerId],
    );
    return Boolean(rows[0]);
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

  private async rawTags(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTagRow[] | null> {
    if (!(await this.ownerPet(ownerId, petId))) return null;
    const [rows] = await this.pool.query<RecoveryTagRow[]>(
      `SELECT t.id, t.pet_id, t.token_id, t.short_code, t.label, t.tag_type,
              t.status, t.last_scanned_at, t.scan_count, t.created_at, t.updated_at
         FROM pet_recovery_tags t
        WHERE t.pet_id = ?
        ORDER BY t.created_at ASC, t.id ASC`,
      [petId],
    );
    return rows;
  }

  private async createRawTag(
    petId: string,
    label: string,
    type: RecoveryTagType,
    tokenId?: string,
    status: RecoveryTagStatus = "ACTIVE",
  ): Promise<RecoveryTagRow> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = `RT-${randomUUID().toUpperCase()}`;
      const nextTokenId = tokenId || randomBytes(16).toString("hex");
      const shortCode = `PC-${randomBytes(4).toString("hex").toUpperCase()}`;
      try {
        await this.pool.query(
          `INSERT INTO pet_recovery_tags
             (id, pet_id, token_id, short_code, label, tag_type, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, petId, nextTokenId, shortCode, label, type, status],
        );
        const [rows] = await this.pool.query<RecoveryTagRow[]>(
          `SELECT id, pet_id, token_id, short_code, label, tag_type, status,
                  last_scanned_at, scan_count, created_at, updated_at
             FROM pet_recovery_tags WHERE id = ? LIMIT 1`,
          [id],
        );
        if (rows[0]) return rows[0];
      } catch (error) {
        if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
        if (tokenId) {
          const [existing] = await this.pool.query<RecoveryTagRow[]>(
            `SELECT id, pet_id, token_id, short_code, label, tag_type, status,
                    last_scanned_at, scan_count, created_at, updated_at
               FROM pet_recovery_tags WHERE token_id = ? LIMIT 1`,
            [tokenId],
          );
          if (existing[0]) return existing[0];
        }
      }
    }
    throw new Error("Could not create recovery tag.");
  }

  private async ensureDefaultTag(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTagRow[] | null> {
    const current = await this.rawTags(ownerId, petId);
    if (!current) return null;
    if (current.length) return current;

    const legacy = await this.ownerRow(ownerId, petId);
    if (!legacy) return null;
    const tokenId = legacy.token_id || randomBytes(16).toString("hex");
    const status: RecoveryTagStatus =
      legacy.token_id && legacy.revoked_at ? "REVOKED" : "ACTIVE";
    await this.createRawTag(petId, "Main tag", "PRINT", tokenId, status);

    if (!legacy.token_id) {
      await this.pool.query(
        `INSERT INTO pet_recovery_tokens (pet_id, token_id, revoked_at)
         VALUES (?, ?, NULL)
         ON DUPLICATE KEY UPDATE token_id = VALUES(token_id), revoked_at = NULL`,
        [petId, tokenId],
      );
    }
    return this.rawTags(ownerId, petId);
  }

  async listTags(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTag[] | null> {
    const rows = await this.ensureDefaultTag(ownerId, petId);
    return rows ? rows.map((row) => this.tagState(row)) : null;
  }

  async createTag(
    ownerId: string,
    petId: string,
    input: { label?: string; tagType?: RecoveryTagType },
  ): Promise<RecoveryTag | null> {
    if (!(await this.ownerPet(ownerId, petId))) return null;
    const row = await this.createRawTag(
      petId,
      tagLabel(input?.label),
      tagType(input?.tagType),
    );
    return this.tagState(row);
  }

  async replaceTag(
    ownerId: string,
    petId: string,
    tagId: string,
  ): Promise<RecoveryTag | null> {
    const [owned] = await this.pool.query<RecoveryTagRow[]>(
      `SELECT t.id, t.pet_id, t.token_id, t.short_code, t.label, t.tag_type,
              t.status, t.last_scanned_at, t.scan_count, t.created_at, t.updated_at
         FROM pet_recovery_tags t
         JOIN pets p ON p.id = t.pet_id
        WHERE t.id = ? AND t.pet_id = ? AND p.owner_id = ?
        LIMIT 1`,
      [tagId, petId, ownerId],
    );
    if (!owned[0]) return null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const tokenId = randomBytes(16).toString("hex");
      const shortCode = `PC-${randomBytes(4).toString("hex").toUpperCase()}`;
      try {
        await this.pool.query(
          `UPDATE pet_recovery_tags
              SET token_id = ?, short_code = ?, status = 'ACTIVE',
                  last_scanned_at = NULL, scan_count = 0
            WHERE id = ?`,
          [tokenId, shortCode, tagId],
        );
        break;
      } catch (error) {
        if (
          (error as { code?: string }).code !== "ER_DUP_ENTRY" ||
          attempt === 7
        )
          throw error;
      }
    }
    const [rows] = await this.pool.query<RecoveryTagRow[]>(
      `SELECT id, pet_id, token_id, short_code, label, tag_type, status,
              last_scanned_at, scan_count, created_at, updated_at
         FROM pet_recovery_tags WHERE id = ? LIMIT 1`,
      [tagId],
    );
    return rows[0] ? this.tagState(rows[0]) : null;
  }

  async setTagStatus(
    ownerId: string,
    petId: string,
    tagId: string,
    status: Exclude<RecoveryTagStatus, "ACTIVE">,
  ): Promise<RecoveryTag | null> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE pet_recovery_tags t
       JOIN pets p ON p.id = t.pet_id
          SET t.status = ?
        WHERE t.id = ? AND t.pet_id = ? AND p.owner_id = ?`,
      [status, tagId, petId, ownerId],
    );
    if (!result.affectedRows) return null;
    const [rows] = await this.pool.query<RecoveryTagRow[]>(
      `SELECT id, pet_id, token_id, short_code, label, tag_type, status,
              last_scanned_at, scan_count, created_at, updated_at
         FROM pet_recovery_tags WHERE id = ? LIMIT 1`,
      [tagId],
    );
    return rows[0] ? this.tagState(rows[0]) : null;
  }

  async getOrCreate(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTokenState | null> {
    const tags = await this.ensureDefaultTag(ownerId, petId);
    if (!tags) return null;
    const active = tags.find((tag) => tag.status === "ACTIVE");
    return active
      ? this.state(active.token_id, true)
      : { active: false, token: null, recoveryUrl: null };
  }

  async rotate(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTokenState | null> {
    const tags = await this.ensureDefaultTag(ownerId, petId);
    if (!tags) return null;
    const primary = tags[0];
    const replaced = await this.replaceTag(ownerId, petId, primary.id);
    if (!replaced?.token)
      return { active: false, token: null, recoveryUrl: null };
    const tokenId = this.tokenIdFromBearer(replaced.token)!;
    await this.pool.query(
      `INSERT INTO pet_recovery_tokens (pet_id, token_id, revoked_at)
       VALUES (?, ?, NULL)
       ON DUPLICATE KEY UPDATE token_id = VALUES(token_id), revoked_at = NULL`,
      [petId, tokenId],
    );
    return this.state(tokenId, true);
  }

  async revoke(
    ownerId: string,
    petId: string,
  ): Promise<RecoveryTokenState | null> {
    if (!(await this.ownerPet(ownerId, petId))) return null;
    await this.ensureDefaultTag(ownerId, petId);
    await this.pool.query(
      "UPDATE pet_recovery_tags SET status = 'REVOKED' WHERE pet_id = ?",
      [petId],
    );
    await this.pool.query(
      `UPDATE pet_recovery_tokens rt
       JOIN pets p ON p.id = rt.pet_id
          SET rt.revoked_at = CURRENT_TIMESTAMP
        WHERE rt.pet_id = ? AND p.owner_id = ?`,
      [petId, ownerId],
    );
    return { active: false, token: null, recoveryUrl: null };
  }

  private async tagByToken(token: string): Promise<TagResolveRow | null> {
    const tokenId = this.tokenIdFromBearer(token);
    if (!tokenId) return null;
    const [rows] = await this.pool.query<TagResolveRow[]>(
      `SELECT t.id, t.pet_id, t.token_id, t.short_code, t.label, t.tag_type,
              t.status, t.last_scanned_at, t.scan_count, t.created_at, t.updated_at,
              p.owner_id, p.name AS pet_name
         FROM pet_recovery_tags t
         JOIN pets p ON p.id = t.pet_id
         JOIN users u ON u.id = p.owner_id
        WHERE t.token_id = ? AND t.status = 'ACTIVE' AND u.status = 'ACTIVE'
        LIMIT 1`,
      [tokenId],
    );
    if (rows[0]) return rows[0];

    const [legacy] = await this.pool.query<
      (RowDataPacket & { pet_id: string; owner_id: string })[]
    >(
      `SELECT rt.pet_id, p.owner_id
         FROM pet_recovery_tokens rt
         JOIN pets p ON p.id = rt.pet_id
         JOIN users u ON u.id = p.owner_id
        WHERE rt.token_id = ? AND rt.revoked_at IS NULL AND u.status = 'ACTIVE'
        LIMIT 1`,
      [tokenId],
    );
    if (!legacy[0]) return null;
    await this.ensureDefaultTag(legacy[0].owner_id, legacy[0].pet_id);
    const [migrated] = await this.pool.query<TagResolveRow[]>(
      `SELECT t.id, t.pet_id, t.token_id, t.short_code, t.label, t.tag_type,
              t.status, t.last_scanned_at, t.scan_count, t.created_at, t.updated_at,
              p.owner_id, p.name AS pet_name
         FROM pet_recovery_tags t
         JOIN pets p ON p.id = t.pet_id
        WHERE t.token_id = ? AND t.status = 'ACTIVE'
        LIMIT 1`,
      [tokenId],
    );
    return migrated[0] || null;
  }

  async resolveCode(code: string): Promise<RecoveryTag | null> {
    const normalized = normalizeShortCode(code);
    if (!/^PC-[A-F0-9]{8}$/.test(normalized)) return null;
    const [rows] = await this.pool.query<RecoveryTagRow[]>(
      `SELECT t.id, t.pet_id, t.token_id, t.short_code, t.label, t.tag_type,
              t.status, t.last_scanned_at, t.scan_count, t.created_at, t.updated_at
         FROM pet_recovery_tags t
         JOIN pets p ON p.id = t.pet_id
         JOIN users u ON u.id = p.owner_id
        WHERE t.short_code = ? AND t.status = 'ACTIVE' AND u.status = 'ACTIVE'
        LIMIT 1`,
      [normalized],
    );
    return rows[0] ? this.tagState(rows[0]) : null;
  }

  async recordScan(
    token: string,
    finderSessionId: string,
    source: "QR" | "CODE" = "QR",
  ): Promise<{
    created: boolean;
    scanId: string;
    tagId: string;
    petId: string;
    ownerId: string;
    petName: string;
    tagLabel: string;
  } | null> {
    const tag = await this.tagByToken(token);
    if (!tag) return null;
    const id = `TS-${randomUUID().toUpperCase()}`;
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT IGNORE INTO recovery_tag_scans
         (id, tag_id, pet_id, owner_id, finder_session_id, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, tag.id, tag.pet_id, tag.owner_id, finderSessionId, source],
    );
    const created = result.affectedRows > 0;
    if (created) {
      await this.pool.query(
        `UPDATE pet_recovery_tags
            SET last_scanned_at = CURRENT_TIMESTAMP, scan_count = scan_count + 1
          WHERE id = ?`,
        [tag.id],
      );
    }
    return {
      created,
      scanId: id,
      tagId: tag.id,
      petId: tag.pet_id,
      ownerId: tag.owner_id,
      petName: tag.pet_name,
      tagLabel: tag.label,
    };
  }

  async listScans(
    ownerId: string,
    petId: string,
    from?: string,
    to?: string | null,
  ): Promise<RecoveryTagScan[] | null> {
    if (!(await this.ownerPet(ownerId, petId))) return null;
    const clauses = ["s.owner_id = ?", "s.pet_id = ?"];
    const values: unknown[] = [ownerId, petId];
    if (from) {
      clauses.push("s.created_at >= ?");
      values.push(new Date(from));
    }
    if (to) {
      clauses.push("s.created_at <= ?");
      values.push(new Date(to));
    }
    const [rows] = await this.pool.query<RecoveryScanRow[]>(
      `SELECT s.id, s.tag_id, s.pet_id, t.label, t.short_code, s.source, s.created_at
         FROM recovery_tag_scans s
         JOIN pet_recovery_tags t ON t.id = s.tag_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY s.created_at ASC`,
      values,
    );
    return rows.map((row) => ({
      id: row.id,
      tagId: row.tag_id,
      petId: row.pet_id,
      label: row.label,
      shortCode: row.short_code,
      source: row.source,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async resolvePetId(token: string): Promise<string | null> {
    return (await this.tagByToken(token))?.pet_id || null;
  }

  async resolveActiveReportPetId(reportId: string): Promise<string | null> {
    const [rows] = await this.pool.query<
      (RowDataPacket & { pet_id: string })[]
    >(
      `SELECT lr.pet_id
         FROM lost_reports lr
         JOIN pets p ON p.id = lr.pet_id
         JOIN users u ON u.id = lr.owner_id
        WHERE lr.id = ? AND lr.status IN ('LOST','SIGHTED') AND u.status = 'ACTIVE'
        LIMIT 1`,
      [reportId],
    );
    return rows[0]?.pet_id || null;
  }

  private async profileForPet(
    petId: string,
    reportId?: string,
  ): Promise<PublicRecoveryProfile | null> {
    const [rows] = await this.pool.query<PublicRecoveryRow[]>(
      `SELECT p.id AS pet_id, p.name, p.species, p.breed, p.sex, p.age_label,
              p.identifying_details, p.microchip_number, p.photo_url,
              u.display_name, u.phone, u.share_recovery_phone,
              u.share_precise_recovery_location
         FROM pets p
         JOIN users u ON u.id = p.owner_id
        WHERE p.id = ? AND u.status = 'ACTIVE'
        LIMIT 1`,
      [petId],
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
          ${reportId ? "AND lr.id = ?" : ""}
        LIMIT 1`,
      reportId ? [row.pet_id, reportId] : [row.pet_id],
    );
    if (reportId && !reportRows[0]) return null;
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
        microchipped: Boolean(row.microchip_number),
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

  async publicProfile(token: string): Promise<PublicRecoveryProfile | null> {
    const petId = await this.resolvePetId(token);
    return petId ? this.profileForPet(petId) : null;
  }

  async publicProfileByReport(
    reportId: string,
  ): Promise<PublicRecoveryProfile | null> {
    const petId = await this.resolveActiveReportPetId(reportId);
    return petId ? this.profileForPet(petId, reportId) : null;
  }
}
