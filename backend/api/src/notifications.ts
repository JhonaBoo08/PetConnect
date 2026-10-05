import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
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
    if (
      !(await this.insertNotification(
        userId,
        type,
        title,
        body,
        data,
        notificationId,
      ))
    )
      return;
    const [devices] = await this.pool.query<PushDeviceRow[]>(
      `SELECT expo_push_token, user_id
         FROM push_devices
        WHERE user_id = ? AND enabled = TRUE`,
      [userId],
    );
    await this.sendPush(devices, title, body, { ...data, type });
  }

  async notifyClinicMembers(
    clinicId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const [rows] = await this.pool.query<
      (RowDataPacket & { user_id: string })[]
    >(
      `SELECT cm.user_id
         FROM clinic_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.clinic_id = ?
          AND u.status = 'ACTIVE'`,
      [clinicId],
    );
    await Promise.all(
      [...new Set(rows.map((row) => row.user_id))].map((userId) =>
        this.notifyUser(userId, type, title, body, data),
      ),
    );
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
      users.map((userId) =>
        this.insertNotification(userId, type, title, body, data),
      ),
    );
    await this.sendPush(devices, title, body, { ...data, type });
  }

  private async insertNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
    notificationId?: string,
  ): Promise<boolean> {
    try {
      await this.pool.query<ResultSetHeader>(
        `INSERT INTO notifications (id, user_id, type, title, body, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
        [
          notificationId || `NT-${randomUUID().toUpperCase()}`,
          userId,
          type,
          title.slice(0, 120),
          body.slice(0, 500),
          JSON.stringify(data),
        ],
      );
      return true;
    } catch (error) {
      if (
        notificationId &&
        (error as { code?: string }).code === "ER_DUP_ENTRY"
      )
        return false;
      throw error;
    }
  }

  private async sendPush(
    devices: PushDeviceRow[],
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (devices.length === 0 || process.env.NODE_ENV === "test") return;

    const messages = devices.map((device) => ({
      to: device.expo_push_token,
      sound: "default",
      title,
      body,
      data,
    }));

    for (let offset = 0; offset < messages.length; offset += 100) {
      const chunk = messages.slice(offset, offset + 100);
      const chunkDevices = devices.slice(offset, offset + 100);
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(process.env.EXPO_ACCESS_TOKEN
              ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(chunk),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          console.error("Expo push request failed:", response.status);
          continue;
        }
        const payload = (await response.json()) as { data?: ExpoPushTicket[] };
        const tickets = Array.isArray(payload.data) ? payload.data : [];
        for (let index = 0; index < tickets.length; index += 1) {
          const ticket = tickets[index];
          const token = chunkDevices[index]?.expo_push_token;
          if (!token) continue;
          if (
            ticket.status === "error" &&
            ticket.details?.error === "DeviceNotRegistered"
          ) {
            await this.disableToken(token);
            continue;
          }
          if (ticket.status === "ok" && ticket.id) {
            await this.pool.query(
              `INSERT INTO expo_push_receipts (receipt_id, expo_push_token)
               VALUES (?, ?)
               ON DUPLICATE KEY UPDATE expo_push_token = VALUES(expo_push_token)`,
              [ticket.id, token],
            );
          }
        }
      } catch (error) {
        console.error("Expo push delivery failed:", error);
      }
    }
  }
}
