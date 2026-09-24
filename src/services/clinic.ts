import { httpsCallable } from "firebase/functions";

import { firebaseClient } from "./firebase/client";

export type ClinicProfileInput = {
  clinicName: string;
  phone: string;
  city: string;
  province: string;
  address: string;
  veterinarianInCharge: string;
  license: string;
  staff: string[];
};

export type ClinicVerificationStatus = "verified" | "pending" | "rejected";

export type RemoteClinicProfile = {
  clinicId: string;
  clinicName: string;
  status: ClinicVerificationStatus;
};

export async function clinicBridgeAvailable(): Promise<boolean> {
  try {
    const { auth } = firebaseClient();
    await auth.authStateReady();
    return Boolean(auth.currentUser);
  } catch {
    return false;
  }
}

export async function submitClinicProfile(
  input: ClinicProfileInput,
): Promise<RemoteClinicProfile> {
  const { functions } = firebaseClient();
  const result = await httpsCallable<ClinicProfileInput, RemoteClinicProfile>(
    functions,
    "registerClinicProfile",
  )(input);
  return result.data;
}

export async function fetchRemoteClinicProfile(): Promise<RemoteClinicProfile | null> {
  const { functions } = firebaseClient();
  const result = await httpsCallable<void, RemoteClinicProfile | null>(
    functions,
    "getClinicProfile",
  )();
  return result.data ?? null;
}