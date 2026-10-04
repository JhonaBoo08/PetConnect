import type { Pool, RowDataPacket } from "mysql2/promise";
import type { MediaStorage } from "./media-storage.js";

type CleanupRow = RowDataPacket & { storage_url: string; attempts: number };

/** A small durable outbox for deletions, including uploads interrupted before DB attachment. */
export class MediaCleanup {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  constructor(
    private pool: Pool,
    private storage: MediaStorage,
  ) {}

  async schedule(reference: string | null, delaySeconds = 0): Promise<void> {
    if (!reference || !this.storage.owns(reference)) return;
    await this.pool.query(
      "INSERT INTO media_cleanup_jobs (storage_url, not_before) VALUES (?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)) " +
        "ON DUPLICATE KEY UPDATE not_before = LEAST(not_before, VALUES(not_before))",
      [reference, Math.max(0, Math.floor(delaySeconds))],
    );
  }
  async schedulePetEvidence(petId: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO media_cleanup_jobs (storage_url, not_before) " +
        "SELECT storage_url, UTC_TIMESTAMP() FROM sighting_evidence WHERE pet_id = ? AND status IN ('STAGED','ATTACHED') " +
        "ON DUPLICATE KEY UPDATE not_before = LEAST(not_before, VALUES(not_before))",
      [petId],
    );
  }
  drain(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.runBatch().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  async removeNow(reference: string | null): Promise<void> {
    if (!reference || !this.storage.owns(reference)) return;
    // Preserve the durable retry without turning a successful mutation into an error.
    await this.runBatch(reference).catch(() => {});
  }
  private async runBatch(reference?: string): Promise<void> {
    const [jobs] = await this.pool.query<CleanupRow[]>(
      reference
        ? "SELECT storage_url, attempts FROM media_cleanup_jobs WHERE storage_url = ? LIMIT 1"
        : "SELECT storage_url, attempts FROM media_cleanup_jobs WHERE not_before <= UTC_TIMESTAMP() ORDER BY not_before, storage_url LIMIT 25",
      reference ? [reference] : [],
    );
    for (const job of jobs) {
      const [refs] = await this.pool.query<RowDataPacket[]>(
        "SELECT (SELECT COUNT(*) FROM pets WHERE photo_url = ?) + " +
          "(SELECT COUNT(*) FROM sighting_evidence WHERE storage_url = ? AND status IN ('STAGED','ATTACHED')) AS active",
        [job.storage_url, job.storage_url],
      );
      if (Number(refs[0].active)) {
        // Keep the reservation in case a crash follows removal of this reference.
        await this.pool.query(
          "UPDATE media_cleanup_jobs SET not_before = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE storage_url = ?",
          [job.storage_url],
        );
        continue;
      }
      {
        try {
          await this.storage.remove(job.storage_url);
        } catch {
          const retrySeconds = Math.min(
            3600,
            60 * 2 ** Math.min(6, Number(job.attempts)),
          );
          await this.pool.query(
            "UPDATE media_cleanup_jobs SET attempts = attempts + 1, not_before = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE storage_url = ?",
            [retrySeconds, job.storage_url],
          );
          continue;
        }
      }
      await this.pool.query(
        "DELETE FROM media_cleanup_jobs WHERE storage_url = ?",
        [job.storage_url],
      );
    }
  }
  start(intervalMs = 60_000): void {
    if (this.timer) return;
    const run = () => {
      void this.drain().catch(() =>
        console.error("Media cleanup temporarily unavailable."),
      );
    };
    this.timer = setInterval(run, Math.max(60_000, intervalMs));
    this.timer.unref();
    run();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
