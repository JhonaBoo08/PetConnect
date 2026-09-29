import type {
  FinderSightingInput,
  LostReport,
  LostReportInput,
  NearbyLostReport,
  PushDeviceInput,
  RecoveryNotification,
  Sighting,
} from "../../../shared/contracts";
import { ApiError, authenticatedFetch, getApiBaseUrl } from "./auth";

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

export const createLostReport = (input: LostReportInput) =>
  authenticatedFetch<LostReport>("/v1/lost-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const listMyLostReports = async () =>
  (await authenticatedFetch<{ reports: LostReport[] }>("/v1/lost-reports"))
    .reports;

export const getLostReport = (id: string) =>
  authenticatedFetch<{ report: LostReport; sightings: Sighting[] }>(
    `/v1/lost-reports/${encodeURIComponent(id)}`,
  );

export const markPetReunited = (id: string) =>
  authenticatedFetch<LostReport>(
    `/v1/lost-reports/${encodeURIComponent(id)}/reunite`,
    { method: "POST" },
  );

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

export const listRecoveryNotifications = async () =>
  (
    await authenticatedFetch<{ notifications: RecoveryNotification[] }>(
      "/v1/notifications",
    )
  ).notifications;

export const markRecoveryNotificationRead = (id: string) =>
  authenticatedFetch<void>(`/v1/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
