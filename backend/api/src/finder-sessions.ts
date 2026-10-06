import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export class FinderSessionError extends Error {}

export type FinderSession = {
  id: string;
  credential: string;
  expiresAt: string;
  phoneVerified: boolean;
  ipHash: string | null;
};

type SessionRow = RowDataPacket & {
  id: string;
  secret_hash: string;
  ip_hash: string | null;
  status: "ACTIVE" | "BLOCKED";
  phone_verified_at: Date | null;
  expires_at: Date;
};

const sessionIdPattern = /^FS-[0-9A-F-]{36}$/;

function safeHexEqual(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class FinderSessions {
  private ttlDays: number;

  constructor(
    private pool: Pool,
    private sessionSecret: string,
    private ipHashSecret: string,
    ttlDays = 30,
  ) {
    this.ttlDays = Math.max(1, Math.min(30, Math.floor(ttlDays || 30)));
    if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
      throw new Error("FINDER_SESSION_SECRET must be at least 32 bytes.");
    }
    if (Buffer.byteLength(ipHashSecret, "utf8") < 32) {
      throw new Error("FINDER_IP_HASH_SECRET must be at least 32 bytes.");
    }
  }

  private hashSessionSecret(secret: string): string {
    return createHmac("sha256", this.sessionSecret)
      .update(secret)
      .digest("hex");
  }

  hashIp(ip: string | undefined | null): string | null {
    const normalized = String(ip || "")
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    return createHmac("sha256", this.ipHashSecret)
      .update(normalized)
      .digest("hex");
  }

  hashPhone(phone: string): string {
    return createHmac("sha256", this.ipHashSecret)
      .update(`phone:${phone}`)
      .digest("hex");
  }

  async create(ip?: string | null): Promise<FinderSession> {
    await this.cleanupExpired();
    const id = `FS-${randomUUID().toUpperCase()}`;
    const secret = randomBytes(32).toString("base64url");
    const credential = `${id}.${secret}`;
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);
    const ipHash = this.hashIp(ip);
    await this.pool.query(
      `INSERT INTO finder_sessions
        (id, secret_hash, ip_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [
        id,
        this.hashSessionSecret(secret),
        ipHash,
        expiresAt.toISOString().slice(0, 19).replace("T", " "),
      ],
    );
    return {
      id,
      credential,
      expiresAt: expiresAt.toISOString(),
      phoneVerified: false,
      ipHash,
    };
  }

  async resolve(
    credential: string | undefined | null,
  ): Promise<FinderSession | null> {
    const value = String(credential || "").trim();
    const separator = value.indexOf(".");
    if (separator <= 0) return null;
    const id = value.slice(0, separator);
    const secret = value.slice(separator + 1);
    if (!sessionIdPattern.test(id) || !secret || secret.includes(".")) {
      return null;
    }

    const [rows] = await this.pool.query<SessionRow[]>(
      `SELECT id, secret_hash, ip_hash, status, phone_verified_at, expires_at
         FROM finder_sessions
        WHERE id = ?
          AND expires_at > UTC_TIMESTAMP()
        LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row || row.status !== "ACTIVE") return null;
    if (!safeHexEqual(row.secret_hash, this.hashSessionSecret(secret)))
      return null;

    await this.pool.query(
      "UPDATE finder_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id],
    );
    return {
      id,
      credential: value,
      expiresAt: row.expires_at.toISOString(),
      phoneVerified: Boolean(row.phone_verified_at),
      ipHash: row.ip_hash,
    };
  }

  async markPhoneVerified(
    sessionId: string,
    phoneHash: string,
    connection: PoolConnection | Pool = this.pool,
  ): Promise<void> {
    const [result] = await connection.query(
      `UPDATE finder_sessions
          SET phone_verified_at = CURRENT_TIMESTAMP,
              verified_phone_hash = ?,
              last_seen_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'ACTIVE' AND expires_at > UTC_TIMESTAMP()`,
      [phoneHash, sessionId],
    );
    if ((result as { affectedRows: number }).affectedRows !== 1)
      throw new FinderSessionError("Finder session expired or unavailable.");
  }

  async incrementSubmission(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE finder_sessions
          SET submission_count = submission_count + 1,
              last_seen_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [sessionId],
    );
  }

  async block(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE finder_sessions
          SET status = 'BLOCKED',
              blocked_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [sessionId],
    );
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.query(
      "DELETE FROM finder_sessions WHERE expires_at <= UTC_TIMESTAMP() LIMIT 200",
    );
  }
}
