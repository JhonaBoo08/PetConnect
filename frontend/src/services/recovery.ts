import type {
  PublicRecoveryProfile,
  RecoveryTag,
  RecoveryTagType,
  RecoveryTokenState,
} from "../../../shared/contracts";
import { ApiError, authenticatedFetch, getApiBaseUrl } from "./auth";

const recoveryTokenPattern = /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/;

async function publicJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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
      body?.message || "Recovery profile is unavailable.",
      response.status,
      body?.error,
    );
  }
  return data as T;
}

export const getPetRecovery = (petId: string) =>
  authenticatedFetch<RecoveryTokenState>(
    `/v1/pets/${encodeURIComponent(petId)}/recovery`,
  );

export const rotatePetRecovery = (petId: string) =>
  authenticatedFetch<RecoveryTokenState>(
    `/v1/pets/${encodeURIComponent(petId)}/recovery/rotate`,
    { method: "POST" },
  );

export const revokePetRecovery = (petId: string) =>
  authenticatedFetch<RecoveryTokenState>(
    `/v1/pets/${encodeURIComponent(petId)}/recovery`,
    { method: "DELETE" },
  );

export const listRecoveryTags = async (petId: string) =>
  (
    await authenticatedFetch<{ tags: RecoveryTag[] }>(
      `/v1/pets/${encodeURIComponent(petId)}/recovery/tags`,
    )
  ).tags;

export const createRecoveryTag = (
  petId: string,
  input: { label?: string; tagType?: RecoveryTagType } = {},
) =>
  authenticatedFetch<RecoveryTag>(
    `/v1/pets/${encodeURIComponent(petId)}/recovery/tags`,
    { method: "POST", body: JSON.stringify(input) },
  );

export const replaceRecoveryTag = (petId: string, tagId: string) =>
  authenticatedFetch<RecoveryTag>(
    `/v1/pets/${encodeURIComponent(petId)}/recovery/tags/${encodeURIComponent(tagId)}/replace`,
    { method: "POST" },
  );

export const markRecoveryTagLost = (petId: string, tagId: string) =>
  authenticatedFetch<RecoveryTag>(
    `/v1/pets/${encodeURIComponent(petId)}/recovery/tags/${encodeURIComponent(tagId)}/lost`,
    { method: "POST" },
  );

export const revokeRecoveryTag = (petId: string, tagId: string) =>
  authenticatedFetch<RecoveryTag>(
    `/v1/pets/${encodeURIComponent(petId)}/recovery/tags/${encodeURIComponent(tagId)}`,
    { method: "DELETE" },
  );

export async function resolveRecoveryCode(code: string) {
  return publicJson<{
    token: string;
    recoveryUrl: string;
    shortCode: string;
  }>(`/v1/recovery/code/${encodeURIComponent(code.trim())}`);
}

export async function getPublicRecovery(
  token: string,
): Promise<PublicRecoveryProfile> {
  return publicJson<PublicRecoveryProfile>(
    `/v1/recovery/${encodeURIComponent(token)}`,
  );
}

export async function getPublicRecoveryByReport(
  reportId: string,
): Promise<PublicRecoveryProfile> {
  return publicJson<PublicRecoveryProfile>(
    `/v1/recovery/report/${encodeURIComponent(reportId)}`,
  );
}

export async function recordRecoveryScan(
  token: string,
  finderCredential: string,
  source: "QR" | "CODE" = "QR",
): Promise<{ recorded: boolean }> {
  return publicJson<{ recorded: boolean }>(
    `/v1/recovery/${encodeURIComponent(token)}/scan`,
    {
      method: "POST",
      headers: { "X-Finder-Session": finderCredential },
      body: JSON.stringify({ source }),
    },
  );
}

export function recoveryTokenFromQrData(data: string): string | null {
  const value = data.trim();
  if (recoveryTokenPattern.test(value)) return value;
  try {
    const url = new URL(value);
    const token = url.searchParams.get("token");
    return token && recoveryTokenPattern.test(token) ? token : null;
  } catch {
    return null;
  }
}
