import type {
  PublicRecoveryProfile,
  RecoveryTokenState,
} from "../../../shared/contracts";
import { ApiError, authenticatedFetch, getApiBaseUrl } from "./auth";

const recoveryTokenPattern = /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/;

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

export async function getPublicRecovery(
  token: string,
): Promise<PublicRecoveryProfile> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/recovery/${encodeURIComponent(token)}`,
  );
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { message?: string; error?: string } | null;
    throw new ApiError(
      body?.message || "Recovery profile is unavailable.",
      response.status,
      body?.error,
    );
  }
  return data as PublicRecoveryProfile;
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
