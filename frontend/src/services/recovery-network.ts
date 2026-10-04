import type {
  FinderSightingInput,
  LostReport,
  LostReportInput,
  NearbyLostReport,
  PushDeviceInput,
  RecoveryContactEvent,
  RecoveryNotification,
  RecoveryTimelineEvent,
  Sighting,
} from "../../../shared/contracts";
import { ApiError, authenticatedFetch, getApiBaseUrl } from "./auth";
import {
  cachedRequest,
  invalidateCached,
  peekCached,
  updateCached,
} from "./resource-cache";

const reportsCacheKey = "owner:recovery:reports";
const overviewCacheKey = "owner:recovery:overview";
const notificationsCacheKey = "owner:notifications";

export type OwnerRecoveryOverview = {
  reports: LostReport[];
  sightingsByReport: Record<string, Sighting[]>;
};

async function publicFetch<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { message?: string; error?: string } | null;
    throw new ApiError(
      body?.message || `Request failed with status ${response.status}`,
      response.status,
      body?.error,
    );
  }
  return data as T;
}

function invalidateRecoveryOwnerCache() {
  invalidateCached(reportsCacheKey);
  invalidateCached(overviewCacheKey);
}

export const peekMyLostReports = () =>
  peekCached<LostReport[]>(reportsCacheKey) ?? [];

export const peekOwnerRecoveryOverview = () =>
  peekCached<OwnerRecoveryOverview>(overviewCacheKey);

export const peekRecoveryNotificationsCached = () =>
  peekCached<RecoveryNotification[]>(notificationsCacheKey);

export const peekRecoveryNotifications = () =>
  peekRecoveryNotificationsCached() ?? [];

export async function createLostReport(
  input: LostReportInput,
): Promise<LostReport> {
  const report = await authenticatedFetch<LostReport>("/v1/lost-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
  invalidateRecoveryOwnerCache();
  return report;
}

export async function listMyLostReports(
  options: { force?: boolean } = {},
): Promise<LostReport[]> {
  return cachedRequest(
    reportsCacheKey,
    async () =>
      (await authenticatedFetch<{ reports: LostReport[] }>("/v1/lost-reports"))
        .reports,
    { ttlMs: 12_000, force: options.force },
  );
}

export async function getOwnerRecoveryOverview(
  options: { force?: boolean } = {},
): Promise<OwnerRecoveryOverview> {
  return cachedRequest(
    overviewCacheKey,
    async () => {
      const overview = await authenticatedFetch<OwnerRecoveryOverview>(
        "/v1/owner/recovery-overview",
      );
      updateCached<LostReport[]>(reportsCacheKey, () => overview.reports);
      return overview;
    },
    { ttlMs: 10_000, force: options.force },
  );
}

export const getLostReport = (id: string) =>
  authenticatedFetch<{ report: LostReport; sightings: Sighting[] }>(
    `/v1/lost-reports/${encodeURIComponent(id)}`,
  );

export const getRecoveryContactEvent = (id: string) =>
  authenticatedFetch<RecoveryContactEvent>(
    `/v1/recovery-contacts/${encodeURIComponent(id)}`,
  );

export const getRecoveryTimeline = async (id: string) =>
  (
    await authenticatedFetch<{ events: RecoveryTimelineEvent[] }>(
      `/v1/lost-reports/${encodeURIComponent(id)}/timeline`,
    )
  ).events;

export const reportFinderSightingAbuse = (
  reportId: string,
  sightingId: string,
) =>
  authenticatedFetch<void>(
    `/v1/lost-reports/${encodeURIComponent(reportId)}/sightings/${encodeURIComponent(sightingId)}/report-abuse`,
    { method: "POST" },
  );

export const reportRecoveryContactAbuse = (id: string) =>
  authenticatedFetch<void>(
    `/v1/recovery-contacts/${encodeURIComponent(id)}/report-abuse`,
    { method: "POST" },
  );

export async function markPetReunited(id: string): Promise<LostReport> {
  const report = await authenticatedFetch<LostReport>(
    `/v1/lost-reports/${encodeURIComponent(id)}/reunite`,
    { method: "POST" },
  );
  invalidateRecoveryOwnerCache();
  return report;
}

export const getNearbyLostReports = async (
  latitude: number,
  longitude: number,
  radiusKm = 10,
) =>
  (
    await publicFetch<{ reports: NearbyLostReport[] }>(
      `/v1/recovery/nearby?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&radiusKm=${encodeURIComponent(radiusKm)}`,
    )
  ).reports;

// Backward-compatible legacy sighting helper. The new app-less finder UI uses
// finder-recovery.ts so it can attach an anonymous session and evidence.
export const submitFinderSighting = (
  token: string,
  input: FinderSightingInput,
) =>
  publicFetch<Sighting>(`/v1/recovery/${encodeURIComponent(token)}/sightings`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const registerPushDevice = (input: PushDeviceInput) =>
  authenticatedFetch<void>("/v1/push/devices", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const unregisterPushDevice = (expoPushToken: string) =>
  authenticatedFetch<void>("/v1/push/devices", {
    method: "DELETE",
    body: JSON.stringify({ expoPushToken }),
  });

export async function listRecoveryNotifications(
  options: { force?: boolean } = {},
): Promise<RecoveryNotification[]> {
  return cachedRequest(
    notificationsCacheKey,
    async () =>
      (
        await authenticatedFetch<{ notifications: RecoveryNotification[] }>(
          "/v1/notifications",
        )
      ).notifications,
    { ttlMs: 8_000, force: options.force },
  );
}

export async function markRecoveryNotificationRead(id: string): Promise<void> {
  await authenticatedFetch<void>(
    `/v1/notifications/${encodeURIComponent(id)}/read`,
    { method: "POST" },
  );
  updateCached<RecoveryNotification[]>(notificationsCacheKey, (current) =>
    current?.map((item) =>
      item.id === id && !item.readAt
        ? { ...item, readAt: new Date().toISOString() }
        : item,
    ),
  );
}
