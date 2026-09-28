import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { randomUUID } from "node:crypto";
import { Accounts } from "./accounts";
import { Pets } from "./pets";

initializeApp();
const auth = getAuth();
const accounts = new Accounts(auth, getFirestore());
const pets = new Pets(getFirestore());
const options = { region: "asia-southeast1", maxInstances: 3 };
async function identity(request: CallableRequest) {
  const bearer = request.rawRequest.headers.authorization;
  if (!request.auth || !bearer?.startsWith("Bearer "))
    throw new HttpsError("unauthenticated", "Sign in to continue.");
  try {
    return await auth.verifyIdToken(bearer.slice(7), true);
  } catch {
    throw new HttpsError("unauthenticated", "Sign in again to continue.");
  }
}
async function safe<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const eventId = randomUUID();
    logger.error(`${context} operation failed`, { eventId });
    throw new HttpsError("internal", `${context} operation failed. Try again.`, {
      eventId,
    });
  }
}
async function owner(request: CallableRequest) {
  const token = await identity(request);
  const profile = (
    await getFirestore().doc(`users/${token.uid}`).get()
  ).data();
  if (
    !profile ||
    profile.status !== "ACTIVE" ||
    profile.role !== "OWNER" ||
    token.role !== "OWNER"
  )
    throw new HttpsError(
      "permission-denied",
      "Pet management is unavailable for this account.",
    );
  return token;
}
export const updatePet = onCall(options, (request) =>
  safe(async () => {
    const token = await owner(request);
    const data = request.data as Record<string, unknown>;
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).some(
        (key) =>
          !["petId", "name", "species", "identifyingDetails"].includes(key),
      )
    )
      throw new HttpsError(
        "invalid-argument",
        "Provide a pet ID and valid pet details.",
      );
    const { petId, ...input } = data;
    if (typeof petId !== "string")
      throw new HttpsError(
        "invalid-argument",
        "Provide the ID of the pet to update.",
      );
    await pets.updatePet(token.uid, petId, input);
    return { updated: true };
  }, "Pet"),
);

export const archivePet = onCall(options, (request) =>
  safe(async () => {
    const token = await owner(request);
    const data = request.data as { petId?: unknown } | null;
    if (typeof data?.petId !== "string")
      throw new HttpsError(
        "invalid-argument",
        "Provide the ID of the pet to archive.",
      );
    await pets.archivePet(token.uid, data.petId);
    return { archived: true };
  }, "Pet"),
);

export const createPet = onCall(options, (request) =>
  safe(async () => {
    const token = await owner(request);
    const petId = await pets.createPet(token.uid, request.data);
    return { petId };
  }, "Pet"),
);

export const initializeOwnerProfile = onCall(options, (request) =>
  safe(async () => {
    const token = await identity(request);
    await accounts.initializeOwner(token.uid, request.data);
    return { status: "ACTIVE", refreshToken: true };
  }, "Account"),
);
export const getSession = onCall(options, (request) =>
  safe(async () => {
    const token = await identity(request);
    return accounts.session(token.uid, token);
  }, "Account"),
);
