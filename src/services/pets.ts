import {
  collection,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseClient } from "./firebase/client";
import {
  parsePet,
  type Pet,
} from "../../backend/functions/src/contracts";

const PETS_LIMIT = 100;

/**
 * Lists the signed-in owner's pets, newest first, using the same
 * owner-scoped query shape the Firestore rules allow.
 * Throws if there is no signed-in user or the query is denied.
 */
export async function listMyPets(options?: { max?: number }): Promise<Pet[]> {
  const { auth, db } = firebaseClient();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to continue.");
  const max = options?.max ?? PETS_LIMIT;
  const snapshot = await getDocs(
    query(
      collection(db, "pets"),
      where("ownerId", "==", uid),
      where("archivedAt", "==", null),
      orderBy("createdAt", "desc"),
      fbLimit(max),
  ),
  );
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as DocumentData;
    return {
      petId: docSnap.id,
      ownerId: data.ownerId as string,
      name: data.name as string,
      species: data.species as string,
      identifyingDetails: data.identifyingDetails as string,
      ...(data.photoPath ? { photoPath: data.photoPath as string } : {}),
      isLost: data.isLost as boolean,
      ...(data.archivedAt ? { archivedAt: data.archivedAt as string } : {}),
    } satisfies Pet;
  });
}

/**
 * Updates the signed-in owner's pet through the updatePet callable,
 * which re-validates ownership server-side.
 */
export async function updateMyPet(
  petId: string,
  input: { name: string; species: string; identifyingDetails: string },
): Promise<void> {
  const { auth, functions } = firebaseClient();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  const pet = parsePet(input);
  await httpsCallable(functions, "updatePet")({ petId, ...pet });
}

/**
 * Soft-deletes the signed-in owner's pet through the archivePet callable.
 * Idempotent: archiving an already-archived pet succeeds without changes.
 */
export async function archiveMyPet(petId: string): Promise<void> {
  const { auth, functions } = firebaseClient();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  await httpsCallable(functions, "archivePet")({ petId });
}
