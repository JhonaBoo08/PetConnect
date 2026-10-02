import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "mysql2/promise";
import {
  HealthClinic,
  HealthClinicValidationError,
} from "../src/health-clinic.js";
import type { Notifications } from "../src/notifications.js";
import type { ScheduledNotifications } from "../src/scheduled-notifications.js";

function fixture() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return [[], []];
    },
  } as unknown as Pool;
  return {
    calls,
    service: new HealthClinic(
      pool,
      {} as Notifications,
      {} as ScheduledNotifications,
    ),
  };
}
const range = {
  from: "2026-09-26T16:00:00.000Z",
  to: "2026-11-07T16:00:00.000Z",
};

test("calendar reminders preserve owner and pet scopes with exclusive UTC range bounds", async () => {
  const { service, calls } = fixture();
  await service.ownerReminders("owner-a", "pet-a", range);
  assert.match(
    calls[0].sql,
    /r\.owner_id = \? AND r\.pet_id = \? AND r\.due_at >= \? AND r\.due_at < \?/,
  );
  assert.deepEqual(calls[0].params, [
    "owner-a",
    "pet-a",
    "2026-09-26 16:00:00",
    "2026-11-07 16:00:00",
  ]);
  assert.doesNotMatch(calls[0].sql, /LIMIT 250/);
});
test("calendar appointments preserve owner scope and include a complete visible range", async () => {
  const { service, calls } = fixture();
  await service.ownerAppointments("owner-a", range);
  assert.match(
    calls[0].sql,
    /a\.owner_id = \? AND a\.appointment_date >= \? AND a\.appointment_date < \?/,
  );
  assert.equal(calls[0].params[0], "owner-a");
  assert.doesNotMatch(calls[0].sql, /LIMIT 250/);
});
test("legacy health hub lists keep their existing limit", async () => {
  const { service, calls } = fixture();
  await service.ownerReminders("owner-a");
  await service.ownerAppointments("owner-a");
  assert.match(calls[0].sql, /LIMIT 250/);
  assert.match(calls[1].sql, /LIMIT 250/);
});
test("invalid, incomplete, reversed, and excessively wide ranges fail before querying", async () => {
  for (const bad of [
    { from: "", to: range.to },
    { from: "invalid", to: range.to },
    { from: range.to, to: range.from },
    { from: range.from, to: "2027-01-01T00:00:00Z" },
  ]) {
    const { service, calls } = fixture();
    await assert.rejects(
      service.ownerAppointments("owner-a", bad),
      HealthClinicValidationError,
    );
    assert.equal(calls.length, 0);
  }
});
