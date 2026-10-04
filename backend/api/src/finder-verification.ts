import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  deliverFinderOtp,
  FinderOtpDeliveryError,
} from "./finder-otp-delivery.js";
import { FinderSessions } from "./finder-sessions.js";

export class FinderVerificationError extends Error {}
export class FinderVerificationRateLimitError extends Error {}

type ChallengeRow = RowDataPacket & {
  id: string;
  finder_session_id: string;
  phone_hash: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
};

export function normalizeFinderPhone(value: unknown): string {
  let raw = String(value || "")
    .trim()
    .replace(/[\s().-]/g, "");
  if (!raw) throw new FinderVerificationError("Enter a phone number.");
  if (raw.startsWith("00")) raw = "+" + raw.slice(2);
  if (/^09\d{9}$/.test(raw)) raw = "+63" + raw.slice(1);
  else if (/^9\d{9}$/.test(raw)) raw = "+63" + raw;
  else if (/^63\d{10}$/.test(raw)) raw = "+" + raw;
  if (!/^\+[1-9]\d{7,14}$/.test(raw)) {
    throw new FinderVerificationError(
      "Enter a valid phone number including country code.",
    );
  }
  return raw;
}

export class FinderVerification {
  private provider: "disabled" | "console" | "webhook" | "smsgate";
  private ttlSeconds: number;
  private otpSecret: string;

  constructor(
    private pool: Pool,
    private sessions: FinderSessions,
  ) {
    const configured = (
      process.env.FINDER_OTP_PROVIDER || "console"
    ).toLowerCase();
    if (!["disabled", "console", "webhook", "smsgate"].includes(configured)) {
      throw new Error("Unknown FINDER_OTP_PROVIDER.");
    }
    this.provider = configured as typeof this.provider;
    this.ttlSeconds = Math.max(
      120,
      Math.min(900, Number(process.env.FINDER_OTP_TTL_SECONDS) || 600),
    );
    this.otpSecret =
      process.env.FINDER_OTP_SECRET ||
      "petconnect-local-finder-otp-secret-change-me-32bytes";
    if (Buffer.byteLength(this.otpSecret, "utf8") < 32) {
      throw new Error("FINDER_OTP_SECRET must be at least 32 bytes.");
    }
    if (process.env.NODE_ENV === "production" && this.provider === "console") {
      throw new Error(
        "FINDER_OTP_PROVIDER=console is not allowed in production.",
      );
    }
    if (
      process.env.NODE_ENV === "production" &&
      process.env.FINDER_OTP_EXPOSE_CODE === "true"
    ) {
      throw new Error("FINDER_OTP_EXPOSE_CODE is not allowed in production.");
    }
  }

  private codeHash(challengeId: string, code: string): string {
    return createHmac("sha256", this.otpSecret)
      .update(`${challengeId}:${code}`)
      .digest("hex");
  }

  async send(
    finderSessionId: string,
    phoneInput: unknown,
  ): Promise<{
    challengeId: string;
    expiresAt: string;
    developmentCode?: string;
  }> {
    if (this.provider === "disabled") {
      throw new FinderVerificationError(
        "Phone verification is not configured on this PetConnect server.",
      );
    }
    const phone = normalizeFinderPhone(phoneInput);
    const phoneHash = this.sessions.hashPhone(phone);

    const [limits] = await this.pool.query<
      (RowDataPacket & {
        session_hour: number | string;
        phone_day: number | string;
        ip_day: number | string;
        seconds_since_last: number | string | null;
      })[]
    >(
      `SELECT
        (SELECT COUNT(*) FROM finder_otp_challenges
          WHERE finder_session_id = ?
            AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)) AS session_hour,
        (SELECT COUNT(*) FROM finder_otp_challenges
          WHERE phone_hash = ?
            AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)) AS phone_day,
        (SELECT COUNT(*)
           FROM finder_otp_challenges c
           JOIN finder_sessions used_session
             ON used_session.id = c.finder_session_id
          WHERE used_session.ip_hash IS NOT NULL
            AND used_session.ip_hash = (
              SELECT current_session.ip_hash
                FROM finder_sessions current_session
               WHERE current_session.id = ?
               LIMIT 1
            )
            AND c.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)) AS ip_day,
        (SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), UTC_TIMESTAMP())
           FROM finder_otp_challenges
          WHERE finder_session_id = ?) AS seconds_since_last`,
      [finderSessionId, phoneHash, finderSessionId, finderSessionId],
    );
    const limit = limits[0];
    if (
      Number(limit?.session_hour || 0) >= 3 ||
      Number(limit?.phone_day || 0) >= 5 ||
      Number(limit?.ip_day || 0) >= 10 ||
      (limit?.seconds_since_last !== null &&
        Number(limit.seconds_since_last) < 60)
    ) {
      throw new FinderVerificationRateLimitError(
        "Please wait before requesting another verification code.",
      );
    }

    const challengeId = `OTP-${randomUUID().toUpperCase()}`;
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    await this.pool.query(
      `INSERT INTO finder_otp_challenges
        (id, finder_session_id, phone_hash, code_hash, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        challengeId,
        finderSessionId,
        phoneHash,
        this.codeHash(challengeId, code),
        expiresAt.toISOString().slice(0, 19).replace("T", " "),
      ],
    );

    try {
      await deliverFinderOtp(phone, code, this.ttlSeconds);
    } catch (error) {
      // Preserve this attempted send in the rate-limit budget, but invalidate it.
      await this.pool.query(
        "UPDATE finder_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [challengeId],
      );
      if (error instanceof FinderOtpDeliveryError)
        throw new FinderVerificationError(error.message);
      throw error;
    }
    return {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      ...(process.env.NODE_ENV !== "production" &&
      this.provider === "console" &&
      process.env.FINDER_OTP_EXPOSE_CODE === "true"
        ? { developmentCode: code }
        : {}),
    };
  }

  async verify(
    finderSessionId: string,
    challengeId: unknown,
    codeInput: unknown,
  ): Promise<void> {
    const id = String(challengeId || "").trim();
    const code = String(codeInput || "").trim();
    if (!/^OTP-[0-9A-F-]{36}$/.test(id) || !/^\d{6}$/.test(code)) {
      throw new FinderVerificationError("Invalid verification code.");
    }
    const [rows] = await this.pool.query<ChallengeRow[]>(
      `SELECT id, finder_session_id, phone_hash, code_hash, attempts,
              expires_at, consumed_at
         FROM finder_otp_challenges
        WHERE id = ? AND finder_session_id = ?
        LIMIT 1`,
      [id, finderSessionId],
    );
    const row = rows[0];
    if (
      !row ||
      row.consumed_at ||
      row.expires_at.getTime() <= Date.now() ||
      Number(row.attempts) >= 5
    ) {
      throw new FinderVerificationError(
        "This verification code is expired or unavailable.",
      );
    }

    const expected = Buffer.from(row.code_hash, "hex");
    const provided = Buffer.from(this.codeHash(id, code), "hex");
    const valid =
      expected.length === provided.length &&
      timingSafeEqual(expected, provided);
    if (!valid) {
      await this.pool.query(
        "UPDATE finder_otp_challenges SET attempts = attempts + 1 WHERE id = ?",
        [id],
      );
      throw new FinderVerificationError("Invalid verification code.");
    }

    await this.pool.query(
      `UPDATE finder_otp_challenges
          SET consumed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND consumed_at IS NULL`,
      [id],
    );
    await this.sessions.markPhoneVerified(finderSessionId, row.phone_hash);
  }
}
