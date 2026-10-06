import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  PushDeviceInput,
  RecoveryNotification,
} from "../../../shared/contracts.js";

type PushDeviceRow = RowDataPacket & {
  expo_push_token: string;
  user_id: string;
};

type NotificationRow = RowDataPacket & {
  id: string;
  type: string;
  title: string;
  body: string;
  data: string | Record<string, unknown> | null;
  read_at: Date | null;
  created_at: Date;
};

type PushReceiptRow = RowDataPacket & {
  receipt_id: string;
  expo_push_token: string;
};

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoPushReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

const expoTokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

function validLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function validLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function dateString(value: Date | null) {
  return value ? value.toISOString() : null;
}

export class PushValidationError extends Error {}

export class Notifications {
  constructor(private pool: Pool) {}

  async registerDevice(userId: string, input: PushDeviceInput): Promise<void> {
    const token = String(input.expoPushToken || "").trim();
    if (!expoTokenPattern.test(token)) {
      throw new PushValidationError("Invalid Expo push token.");
    }
    if (!["ios", "android"].includes(input.platform)) {
      throw new PushValidationError("Invalid push platform.");
    }
    const hasLat = input.latitude !== undefined;
    const hasLng = input.longitude !== undefined;
    if (hasLat !== hasLng) {
      throw new PushValidationError(
        "Latitude and longitude must be provided together.",
      );
    }
    if (
      hasLat &&
      (!validLatitude(Number(input.latitude)) ||
        !validLongitude(Number(input.longitude)))
    ) {
      throw new PushValidationError("Invalid device location.");
    }

    await this.pool.query(
      `INSERT INTO push_devices (
        expo_push_token, user_id, platform, latitude, longitude,
        location_accuracy_m, enabled, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        platform = VALUES(platform),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        location_accuracy_m = VALUES(location_accuracy_m),
        enabled = TRUE,
        last_seen_at = CURRENT_TIMESTAMP`,
      [
        token,
        userId,
        input.platform,
        hasLat ? Number(input.latitude) : null,
        hasLng ? Number(input.longitude) : null,
        input.accuracyM ?? null,
      ],
    );
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM push_devices WHERE expo_push_token = ? AND user_id = ?",
      [token, userId],
    );
  }

  private async disableToken(token: string): Promise<void> {
    await this.pool.query(
      "UPDATE push_devices SET enabled = FALSE WHERE expo_push_token = ?",
      [token],
    );
  }

  async processPushReceipts(limit = 100): Promise<number> {
    if (process.env.NODE_ENV === "test") return 0;
    // Expo removes receipts after 24 hours. Expired tickets must not occupy
    // the front of every bounded batch and starve newer delivery results.
    await this.pool.query(
      "DELETE FROM expo_push_receipts WHERE created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) LIMIT 500",
    );
    const [rows] = await this.pool.query<PushReceiptRow[]>(
      `SELECT receipt_id, expo_push_token
         FROM expo_push_receipts
        WHERE checked_at IS NULL
          AND created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
        ORDER BY created_at ASC
        LIMIT ?`,
      [Math.max(1, Math.min(300, limit))],
    );
    if (!rows.length) return 0;

    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ ids: rows.map((row) => row.receipt_id) }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) {
      console.error("Expo push receipt request failed:", response.status);
      return 0;
    }

    const payload = (await response.json()) as {
      data?: Record<string, ExpoPushReceipt>;
    };
    let processed = 0;
    for (const row of rows) {
      const receipt = payload.data?.[row.receipt_id];
      if (!receipt) continue;
      if (
        receipt.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      ) {
        await this.disableToken(row.expo_push_token);
      }
      await this.pool.query(
        "DELETE FROM expo_push_receipts WHERE receipt_id = ?",
        [row.receipt_id],
      );
      processed += 1;
    }

    return processed;
  }

  async list(userId: string): Promise<RecoveryNotification[]> {
    const [rows] = await this.pool.query<NotificationRow[]>(
      `SELECT id, type, title, body, data, read_at, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 100`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      data:
        typeof row.data === "string"
          ? (JSON.parse(row.data) as Record<string, unknown>)
          : row.data,
      readAt: dateString(row.read_at),
      createdAt: row.created_at.toISOString(),
    }));
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const [result] = await this.pool.query(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = ? AND user_id = ?`,
      [id, userId],
    );
    return Number((result as { affectedRows?: number }).affectedRows || 0) > 0;
  }

  async notifyUser(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    notificationId?: string,
  ): Promise<void> {
    const id = notificationId || "NT-" + randomUUID().toUpperCase();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owners] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE id = ? AND role = 'OWNER' AND status = 'ACTIVE' FOR UPDATE",
        [userId],
      );
      if (!owners.length) {
        await connection.commit();
        return;
      }
      try {
        await connection.query(
          "INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)",
          [
            id,
            userId,
            type,
            title.slice(0, 120),
            body.slice(0, 500),
            JSON.stringify(data),
          ],
        );
      } catch (error) {
        if (
          !notificationId ||
          (error as { code?: string }).code !== "ER_DUP_ENTRY"
        )
          throw error;
        const [existing] = await connection.query<RowDataPacket[]>(
          "SELECT user_id FROM notifications WHERE id = ?",
          [id],
        );
        if (existing[0]?.user_id !== userId)
          throw new Error("Notification identity conflict.");
      }
      const [devices] = await connection.query<PushDeviceRow[]>(
        "SELECT expo_push_token, user_id FROM push_devices WHERE user_id = ? AND enabled = TRUE",
        [userId],
      );
      for (const device of devices) {
        await connection.query(
          "INSERT INTO push_delivery_jobs (id, notification_id, expo_push_token) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE notification_id = VALUES(notification_id)",
          ["PD-" + randomUUID().toUpperCase(), id, device.expo_push_token],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async notifyNearby(
    latitude: number,
    longitude: number,
    radiusKm: number,
    excludeUserId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const [devices] = await this.pool.query<PushDeviceRow[]>(
      `SELECT expo_push_token, user_id
         FROM push_devices
        WHERE enabled = TRUE
          AND user_id <> ?
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND (
            6371 * ACOS(
              LEAST(
                1,
                COS(RADIANS(?)) * COS(RADIANS(latitude))
                  * COS(RADIANS(longitude) - RADIANS(?))
                  + SIN(RADIANS(?)) * SIN(RADIANS(latitude))
              )
            )
          ) <= ?`,
      [excludeUserId, latitude, longitude, latitude, radiusKm],
    );

    const users = [...new Set(devices.map((device) => device.user_id))];
    await Promise.all(
      users.map((userId) => this.notifyUser(userId, type, title, body, data)),
    );
  }

  async processPushDeliveries(
    limit = 25,
  ): Promise<{ sent: number; failed: number; cancelled: number }> {
    const connection = await this.pool.getConnection();
    let jobs: (RowDataPacket & { id: string; attempts: number })[] = [];
    try {
      await connection.beginTransaction();
      await connection.query(
        "UPDATE push_delivery_jobs SET status = 'PENDING', claimed_at = NULL WHERE status = 'PROCESSING' AND claimed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) LIMIT 100",
      );
      const [selected] = await connection.query<
        (RowDataPacket & { id: string; attempts: number })[]
      >(
        "SELECT id, attempts FROM push_delivery_jobs WHERE status = 'PENDING' AND available_at <= UTC_TIMESTAMP() ORDER BY available_at, created_at LIMIT ? FOR UPDATE SKIP LOCKED",
        [Math.max(1, Math.min(100, limit))],
      );
      jobs = selected;
      if (jobs.length)
        await connection.query(
          "UPDATE push_delivery_jobs SET status = 'PROCESSING', claimed_at = UTC_TIMESTAMP(), attempts = attempts + 1 WHERE id IN (?)",
          [jobs.map((job) => job.id)],
        );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    let sent = 0,
      failed = 0,
      cancelled = 0;
    // Bound concurrency so a provider outage cannot hold the worker indefinitely.
    for (let offset = 0; offset < jobs.length; offset += 5) {
      await Promise.all(
        jobs.slice(offset, offset + 5).map(async (job) => {
          try {
            const [rows] = await this.pool.query<
              (NotificationRow & { expo_push_token: string })[]
            >(
              "SELECT n.id, n.type, n.title, n.body, n.data, d.expo_push_token FROM push_delivery_jobs j JOIN notifications n ON n.id = j.notification_id JOIN users u ON u.id = n.user_id AND u.role = 'OWNER' AND u.status = 'ACTIVE' JOIN push_devices d ON d.expo_push_token = j.expo_push_token AND d.user_id = n.user_id AND d.enabled = TRUE WHERE j.id = ? AND j.status = 'PROCESSING'",
              [job.id],
            );
            const row = rows[0];
            if (!row) {
              await this.pool.query(
                "UPDATE push_delivery_jobs SET status = 'CANCELLED', claimed_at = NULL WHERE id = ? AND status = 'PROCESSING'",
                [job.id],
              );
              cancelled += 1;
              return;
            }
            const data =
              typeof row.data === "string"
                ? (JSON.parse(row.data) as Record<string, unknown>)
                : row.data || {};
            const response = await fetch(
              "https://exp.host/--/api/v2/push/send",
              {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  ...(process.env.EXPO_ACCESS_TOKEN
                    ? {
                        Authorization:
                          "Bearer " + process.env.EXPO_ACCESS_TOKEN,
                      }
                    : {}),
                },
                body: JSON.stringify([
                  {
                    to: row.expo_push_token,
                    sound: "default",
                    title: row.title,
                    body: row.body,
                    data: { ...data, type: row.type },
                  },
                ]),
                signal: AbortSignal.timeout(5000),
              },
            );
            if (!response.ok) throw new Error("expo-http-" + response.status);
            const payload = (await response.json()) as {
              data?: ExpoPushTicket[];
            };
            const ticket = Array.isArray(payload.data)
              ? payload.data[0]
              : undefined;
            if (
              ticket?.status === "error" &&
              ticket.details?.error === "DeviceNotRegistered"
            ) {
              await this.disableToken(row.expo_push_token);
              await this.pool.query(
                "UPDATE push_delivery_jobs SET status = 'CANCELLED', claimed_at = NULL, last_error = 'DeviceNotRegistered' WHERE id = ? AND status = 'PROCESSING'",
                [job.id],
              );
              cancelled += 1;
              return;
            }
            if (ticket?.status !== "ok" || !ticket.id)
              throw new Error("expo-ticket-unavailable");
            const save = await this.pool.getConnection();
            try {
              await save.beginTransaction();
              await save.query(
                "INSERT INTO expo_push_receipts (receipt_id, expo_push_token) VALUES (?, ?) ON DUPLICATE KEY UPDATE expo_push_token = VALUES(expo_push_token)",
                [ticket.id, row.expo_push_token],
              );
              await save.query(
                "UPDATE push_delivery_jobs SET status = 'SENT', claimed_at = NULL, sent_at = UTC_TIMESTAMP(), last_error = NULL WHERE id = ? AND status = 'PROCESSING'",
                [job.id],
              );
              await save.commit();
            } catch (error) {
              await save.rollback();
              throw error;
            } finally {
              save.release();
            }
            sent += 1;
          } catch (error) {
            failed += 1;
            const attempt = Number(job.attempts) + 1;
            const retrySeconds = Math.min(
              3600,
              30 * Math.pow(2, Math.min(7, attempt - 1)),
            );
            const detail =
              error instanceof Error && /^expo-[a-z0-9-]+$/.test(error.message)
                ? error.message
                : "push-delivery-failed";
            await this.pool.query(
              "UPDATE push_delivery_jobs SET status = ?, claimed_at = NULL, available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), last_error = ? WHERE id = ? AND status = 'PROCESSING'",
              [
                attempt >= 10 ? "FAILED" : "PENDING",
                retrySeconds,
                detail,
                job.id,
              ],
            );
          }
        }),
      );
    }
    return { sent, failed, cancelled };
  }
}
