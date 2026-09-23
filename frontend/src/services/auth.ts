import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { firebaseClient } from "./firebase/client";
import {
  InitializeOwnerRequest,
  SessionResponse,
  UpdateProfileRequest,
} from "../../../shared/contracts";

function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL || "http://127.0.0.1:3000";
}

async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const auth = firebaseClient().auth;
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new Error("Sign in to continue.");
  }
  const idToken = await auth.currentUser.getIdToken(true);

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.message || `Request failed with status ${response.status}`,
    );
  }
  return data as T;
}

export async function completeOwnerRegistration(input: InitializeOwnerRequest) {
  const auth = firebaseClient().auth;
  if (!auth.currentUser)
    throw new Error("Sign in before completing your profile.");
  await authenticatedFetch<{ status: string }>("/v1/account/initialize", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
  return completeOwnerRegistration(input);
}

export async function login(email: string, password: string) {
  await signInWithEmailAndPassword(
    firebaseClient().auth,
    email.trim(),
    password,
  );
  return currentSession();
}

export async function currentSession(): Promise<SessionResponse> {
  return authenticatedFetch<SessionResponse>("/v1/session", {
    method: "GET",
  });
}

export async function updateProfile(input: UpdateProfileRequest) {
  return authenticatedFetch<{ success: boolean }>("/v1/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export const resetPassword = (email: string) =>
  sendPasswordResetEmail(firebaseClient().auth, email.trim());

export const logout = () => signOut(firebaseClient().auth);
