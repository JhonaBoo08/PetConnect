import type { Pool, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { Notifications } from "./notifications.js";

type ScheduledRow = RowDataPacket & {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: string | Record<string, unknown> | null;
};

export type ScheduledNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  scheduledAt: Date;
  dedupeKey?: string | null;
};

function sqlDate(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

export class ScheduledNotifications {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private pool: Pool,
    private notifications: Notifications,
  ) {}

  async schedule(input: ScheduledNotificationInput): Promise<string> {
    if (!Number.isFinite(input.scheduledAt.getTime())) {
      throw new Error("Invalid scheduled notification time.");
    }
    const id = `SN-${randomUUID().toUpperCase()}`;
    const data = JSON.stringify(input.data || {});
    if (input.dedupeKey) {
      await this.pool.query(
        `INSERT INTO scheduled_notifications (
          id, user_id, type, title, body, data, scheduled_at, dedupe_key, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        ON DUPLICATE KEY UPDATE
          user_id = VALUES(user_id),
          type = VALUES(type),
          title = VALUES(title),
          body = VALUES(body),
          data = VALUES(data),
          scheduled_at = VALUES(scheduled_at),
          status = 'PENDING',
          claimed_at = NULL,
          sent_at = NULL`,
        [
          id,
          input.userId,
          input.type,
          input.title.slice(0, 120),
          input.body.slice(0, 500),
          data,
          sqlDate(input.scheduledAt),
          input.dedupeKey,
        ],
      );
      return id;
    }

    await this.pool.query(
      `INSERT INTO scheduled_notifications (
        id, user_id, type, title, body, data, scheduled_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        id,
        input.userId,
        input.type,
        input.title.slice(0, 120),
        input.body.slice(0, 500),
        data,
        sqlDate(input.scheduledAt),
      ],
    );
    return id;
  }

  async cancel(dedupeKey: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_notifications
          SET status = 'CANCELLED', claimed_at = NULL
        WHERE dedupe_key = ? AND status IN ('PENDING', 'PROCESSING')`,
      [dedupeKey],
    );
  }

  async processDue(limit = 50): Promise<{ sent: number; failed: number }> {
    const connection = await this.pool.getConnection();
    let rows: ScheduledRow[] = [];
    try {
      await connection.beginTransaction();
      await connection.query(
        `UPDATE scheduled_notifications
            SET status = 'PENDING', claimed_at = NULL
          WHERE status = 'PROCESSING'
            AND claimed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)`,
      );
      const [selected] = await connection.query<ScheduledRow[]>(
        `SELECT id, user_id, type, title, body, data
           FROM scheduled_notifications
          WHERE status = 'PENDING'
            AND scheduled_at <= UTC_TIMESTAMP()
          ORDER BY scheduled_at ASC
          LIMIT ?
          FOR UPDATE`,
        [Math.max(1, Math.min(100, limit))],
      );
      rows = selected;
      if (rows.length) {
        await connection.query(
          `UPDATE scheduled_notifications
              SET status = 'PROCESSING', claimed_at = UTC_TIMESTAMP()
            WHERE id IN (?)`,
          [rows.map((row) => row.id)],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const data =
          typeof row.data === "string"
            ? (JSON.parse(row.data) as Record<string, unknown>)
            : row.data || {};
        await this.notifications.notifyUser(
          row.user_id,
          row.type,
          row.title,
          row.body,
          data,
        );
        await this.pool.query(
          `UPDATE scheduled_notifications
              SET status = 'SENT', sent_at = UTC_TIMESTAMP()
            WHERE id = ? AND status = 'PROCESSING'`,
          [row.id],
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error("Scheduled notification delivery failed:", error);
        await this.pool.query(
          `UPDATE scheduled_notifications
              SET status = 'PENDING', claimed_at = NULL
            WHERE id = ? AND status = 'PROCESSING'`,
          [row.id],
        );
      }
    }
    return { sent, failed };
  }

  start(intervalMs = 60_000): void {
    if (this.timer) return;
    const run = () => {
      void this.processDue().catch((error) =>
        console.error("Scheduled notification worker failed:", error),
      );
    };
    run();
    this.timer = setInterval(run, Math.max(10_000, intervalMs));
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
