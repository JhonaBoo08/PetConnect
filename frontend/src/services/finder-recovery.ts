import { Platform } from "react-native";

import type {
  FinderSessionPublicState,
  FinderSightingInput,
  FinderSubmissionResult,
} from "../../../shared/contracts";
import { ApiError, getApiBaseUrl } from "./auth";

const storageKey = "petconnect.finder-session.v1";
let memoryCredential = "";

function readCredential(): string {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    return localStorage.getItem(storageKey) || "";
  }
  return memoryCredential;
}

function writeCredential(value: string) {
  memoryCredential = value;
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    localStorage.setItem(storageKey, value);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
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

export async function ensureFinderSession(): Promise<FinderSessionPublicState> {
  const existing = readCredential();
  const response = await fetch(
    `${getApiBaseUrl()}/v1/recovery/finder-session`,
    {
      method: "POST",
      headers: existing ? { "X-Finder-Session": existing } : undefined,
    },
  );
  const session = await responseJson<FinderSessionPublicState>(response);
  writeCredential(session.credential);
  return session;
}

async function finderRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let credential = readCredential();
  if (!credential) {
    credential = (await ensureFinderSession()).credential;
  }

  const headers = new Headers(options.headers);
  headers.set("X-Finder-Session", credential);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    writeCredential("");
    credential = (await ensureFinderSession()).credential;
    headers.set("X-Finder-Session", credential);
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers,
    });
  }
  return responseJson<T>(response);
}

export type FinderEvidenceUpload = {
  id: string;
  expiresAt: string;
  byteSize: number;
  width: number;
  height: number;
  mimeType: string;
};

async function finderPhotoForm(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    if (blob.size > 8 * 1024 * 1024) {
      throw new Error("Finder photo must be under 8 MB.");
    }
    form.append("file", blob, "finder-photo.jpg");
  } else {
    form.append("file", {
      uri,
      name: "finder-photo.jpg",
      type: "image/jpeg",
    } as unknown as Blob);
  }
  return form;
}

export async function uploadFinderPhoto(
  recoveryToken: string,
  uri: string,
): Promise<FinderEvidenceUpload> {
  return finderRequest<FinderEvidenceUpload>(
    `/v1/recovery/${encodeURIComponent(recoveryToken)}/evidence/photo`,
    { method: "POST", body: await finderPhotoForm(uri) },
  );
}

export async function uploadFinderPhotoByReportId(
  reportId: string,
  uri: string,
): Promise<FinderEvidenceUpload> {
  return finderRequest<FinderEvidenceUpload>(
    `/v1/recovery/report/${encodeURIComponent(reportId)}/evidence/photo`,
    { method: "POST", body: await finderPhotoForm(uri) },
  );
}

export const submitFinderReport = (
  recoveryToken: string,
  input: FinderSightingInput,
) =>
  finderRequest<FinderSubmissionResult>(
    `/v1/recovery/${encodeURIComponent(recoveryToken)}/sightings`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

export const submitFinderReportByReportId = (
  reportId: string,
  input: FinderSightingInput,
) =>
  finderRequest<FinderSubmissionResult>(
    `/v1/recovery/report/${encodeURIComponent(reportId)}/sightings`,
    {
      method: "POST",
      body: JSON.stringify({ ...input, encounterType: "SEEN" }),
    },
  );

export const sendFinderOtp = (phone: string) =>
  finderRequest<{
    challengeId: string;
    expiresAt: string;
    developmentCode?: string;
  }>("/v1/recovery/finder-session/otp/send", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });

export const verifyFinderOtp = (challengeId: string, code: string) =>
  finderRequest<{ verified: true; expiresAt: string }>(
    "/v1/recovery/finder-session/otp/verify",
    {
      method: "POST",
      body: JSON.stringify({ challengeId, code }),
    },
  );

export function newFinderIdempotencyKey(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID().replaceAll("-", "");
  }
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 48);
}
