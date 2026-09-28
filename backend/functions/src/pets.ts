import { FieldValue, Firestore, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { parsePet } from "./contracts";

export class Pets {
  constructor(private readonly db: Firestore = getFirestore()) {}

  async createPet(ownerId: string, input: unknown): Promise<string> {
    let pet;
    try {
      pet = parsePet(input);
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Provide a valid pet name, species, and identifying details.",
      );
    }

    const petRef = this.db.collection("pets").doc();

    await petRef.set({
      ownerId,
      name: pet.name,
      species: pet.species,
      identifyingDetails: pet.identifyingDetails,
      isLost: false,
      archivedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return petRef.id;
  }

  async updatePet(ownerId: string, petId: string, input: unknown): Promise<void> {
    let pet;
    try {
      pet = parsePet(input);
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Provide a valid pet name, species, and identifying details.",
      );
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(petId))
      throw new HttpsError("permission-denied", "Pet is not available.");
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`pets/${petId}`);
      const snapshot = await tx.get(ref);
      // One denial for missing and foreign pets so callers cannot probe IDs.
      if (!snapshot.exists || snapshot.get("ownerId") !== ownerId)
        throw new HttpsError("permission-denied", "Pet is not available.");
      // Archived pets are read-only; there is no unarchive operation.
      if (snapshot.get("archivedAt"))
        throw new HttpsError("permission-denied", "Pet is not available.");
      tx.update(ref, {
        name: pet.name,
        species: pet.species,
        identifyingDetails: pet.identifyingDetails,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  async archivePet(ownerId: string, petId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(petId))
      throw new HttpsError("permission-denied", "Pet is not available.");
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`pets/${petId}`);
      const snapshot = await tx.get(ref);
      // One denial for missing and foreign pets so callers cannot probe IDs.
      if (!snapshot.exists || snapshot.get("ownerId") !== ownerId)
        throw new HttpsError("permission-denied", "Pet is not available.");
      // Soft delete: stamp archivedAt once. Retrying is a no-op, mirroring
      // account disabling.
      if (!snapshot.get("archivedAt"))
        tx.update(ref, { archivedAt: FieldValue.serverTimestamp() });
    });
  }
}
