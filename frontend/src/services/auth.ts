import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { firebaseClient } from "./firebase/client";
import type {
  InitializeOwnerRequest,
  PrivacySettings,
  SessionResponse,
  UpdatePrivacySettings,
  UpdateProfileRequest,
  UserRole,
} from "../../../shared/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (
    !configured &&
    (process.env.EXPO_PUBLIC_FIREBASE_ENV ?? "emulator") !== "emulator"
  ) {
    throw new Error(
      "Set EXPO_PUBLIC_API_BASE_URL for this Firebase environment.",
    );
  }
  return (configured || "http://127.0.0.1:3000").replace(/\/$/, "");
}

export async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const auth = firebaseClient().auth;
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  const idToken = await auth.currentUser.getIdToken();

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${idToken}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
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

export async function completeOwnerRegistration(input: InitializeOwnerRequest) {
  const user = firebaseClient().auth.currentUser;
  if (!user) throw new Error("Sign in before completing your profile.");
  await authenticatedFetch<{ status: string }>("/v1/account/initialize", {
    method: "POST",
    body: JSON.stringify(input),
  });
  // The API has just assigned an OWNER custom claim; the old token cannot
  // authorize /v1/session until this token is refreshed.
  await user.getIdToken(true);
  return currentSession();
}

export async function registerOwner(
  email: string,
  password: string,
  input: InitializeOwnerRequest,
) {
  await createUserWithEmailAndPassword(
    firebaseClient().auth,
    email.trim(),
    password,
  );
  // Keep the Firebase user signed in if the API fails so registration can resume.
  return completeOwnerRegistration(input);
}

export async function login(email: string, password: string, role: UserRole) {
  const auth = firebaseClient().auth;
  await signInWithEmailAndPassword(auth, email.trim(), password);
  const session = await currentSession();
  if (session.role !== role) {
    await signOut(auth);
    throw new Error(
      role === "CLINIC"
        ? "This is a pet owner account. Select Pet Owner to sign in."
        : "This is a clinic account. Select Vet Clinic to sign in.",
    );
  }
  return session;
}

export async function currentSession(): Promise<SessionResponse> {
  return authenticatedFetch<SessionResponse>("/v1/session");
}

export async function updateProfile(input: UpdateProfileRequest) {
  return authenticatedFetch<{ success: boolean }>("/v1/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export const getPrivacySettings = () =>
  authenticatedFetch<PrivacySettings>("/v1/privacy");

export const updatePrivacySettings = (input: UpdatePrivacySettings) =>
  authenticatedFetch<PrivacySettings>("/v1/privacy", {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(firebaseClient().auth, email.trim());

export const logout = () => signOut(firebaseClient().auth);
