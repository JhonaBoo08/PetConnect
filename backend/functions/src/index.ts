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

initializeApp();
const auth = getAuth();
const accounts = new Accounts(auth, getFirestore());
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
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const eventId = randomUUID();
    logger.error("Account operation failed", { eventId });
    throw new HttpsError("internal", "Account operation failed. Try again.", {
      eventId,
    });
  }
}
export const initializeOwnerProfile = onCall(options, (request) =>
  safe(async () => {
    const token = await identity(request);
    await accounts.initializeOwner(token.uid, request.data);
    return { status: "ACTIVE", refreshToken: true };
  }),
);
export const getSession = onCall(options, (request) =>
  safe(async () => {
    const token = await identity(request);
    return accounts.session(token.uid, token);
  }),
);
