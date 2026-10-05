import type { Pool, RowDataPacket } from "mysql2/promise";
import type { FinderRiskState } from "../../../shared/contracts.js";

export type AbuseAssessment = {
  riskState: FinderRiskState;
  verificationRequired: boolean;
  blocked: boolean;
  reasons: string[];
};

type CountRow = RowDataPacket & {
  recent_15m: number | string;
  last_day: number | string;
  distinct_pets_day: number | string;
};

export class RecoveryAbuse {
  constructor(private pool: Pool) {}

  async assess(
    finderSessionId: string,
    phoneVerified: boolean,
    evidenceSha256?: string | null,
  ): Promise<AbuseAssessment> {
    const [rows] = await this.pool.query<CountRow[]>(
      `SELECT
          SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)) AS recent_15m,
          COUNT(*) AS last_day,
          COUNT(DISTINCT pet_id) AS distinct_pets_day
       FROM (
         SELECT lr.pet_id AS pet_id, s.created_at
           FROM sightings s
           JOIN lost_reports lr ON lr.id = s.report_id
          WHERE s.finder_session_id = ?
            AND s.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
         UNION ALL
         SELECT rce.pet_id AS pet_id, rce.created_at
           FROM recovery_contact_events rce
          WHERE rce.finder_session_id = ?
            AND rce.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
       ) activity`,
      [finderSessionId, finderSessionId],
    );
    const row = rows[0] || {
      recent_15m: 0,
      last_day: 0,
      distinct_pets_day: 0,
    };
    const recent = Number(row.recent_15m || 0);
    const daily = Number(row.last_day || 0);
    const distinct = Number(row.distinct_pets_day || 0);
    const reasons: string[] = [];

    if (recent >= 5) reasons.push("high_recent_submission_velocity");
    if (daily >= 12) reasons.push("high_daily_submission_volume");
    if (distinct >= 6) reasons.push("many_distinct_pets");

    if (evidenceSha256) {
      const [duplicates] = await this.pool.query<
        (RowDataPacket & { count: number | string })[]
      >(
        `SELECT COUNT(DISTINCT pet_id) AS count
           FROM sighting_evidence
          WHERE sha256 = ?
            AND finder_session_id = ?
            AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)`,
        [evidenceSha256, finderSessionId],
      );
      if (Number(duplicates[0]?.count || 0) >= 3) {
        reasons.push("same_photo_reused_across_pets");
      }
    }

    const extreme = recent >= 15 || daily >= 30 || distinct >= 15;
    if (extreme && !phoneVerified) {
      return {
        riskState: "BLOCKED",
        verificationRequired: true,
        blocked: true,
        reasons,
      };
    }
    if (reasons.length && !phoneVerified) {
      return {
        riskState: "REVIEW",
        verificationRequired: true,
        blocked: false,
        reasons,
      };
    }
    return {
      riskState: reasons.length ? "REVIEW" : "ACCEPTED",
      verificationRequired: false,
      blocked: false,
      reasons,
    };
  }
}
