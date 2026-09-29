import { randomUUID } from "crypto";
import { Pool, RowDataPacket } from "mysql2/promise";
import {
  PetInput,
  Pet,
} from "../../../shared/contracts.js";

export function parsePet(input: unknown): PetInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid pet input");
  }

  const value = input as Record<string, unknown>;
  const allowedFields = new Set([
    "name",
    "species",
    "breed",
    "birthDate",
    "photoUrl",
  ]);

  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }

  if (typeof value.name !== "string") {
    throw new Error("Pet name is required");
  }

  const name = value.name.trim();
  if (name.length < 1 || name.length > 100) {
    throw new Error("Invalid pet name");
  }

  if (typeof value.species !== "string") {
    throw new Error("Pet species is required");
  }

  const species = value.species.trim();
  if (species.length < 1 || species.length > 50) {
    throw new Error("Invalid pet species");
  }

  let breed: string | undefined;
  if (value.breed !== undefined) {
    if (typeof value.breed !== "string") {
      throw new Error("Invalid pet breed");
    }

    breed = value.breed.trim();
    if (breed.length > 100) {
      throw new Error("Invalid pet breed");
    }

    if (breed === "") {
      breed = undefined;
    }
  }

  let birthDate: string | undefined;
  if (value.birthDate !== undefined) {
    if (typeof value.birthDate !== "string") {
      throw new Error("Invalid birth date");
    }

    birthDate = value.birthDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      throw new Error("Invalid birth date");
    }
  }

  let photoUrl: string | undefined;
  if (value.photoUrl !== undefined) {
    if (typeof value.photoUrl !== "string") {
      throw new Error("Invalid photo URL");
    }

    photoUrl = value.photoUrl.trim();

    if (photoUrl.length > 512) {
      throw new Error("Invalid photo URL");
    }

    if (photoUrl === "") {
      photoUrl = undefined;
    }
  }

  return {
    name,
    species,
    ...(breed !== undefined ? { breed } : {}),
    ...(birthDate !== undefined ? { birthDate } : {}),
    ...(photoUrl !== undefined ? { photoUrl } : {}),
  };
}

export class Pets {
  constructor(private pool: Pool) {}

  async create(ownerId: string, input: PetInput): Promise<Pet> {
    const pet = parsePet(input);
    const id = randomUUID();

    await this.pool.query(
      `INSERT INTO pets
        (id, owner_id, name, species, breed, birth_date, photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ownerId,
        pet.name,
        pet.species,
        pet.breed ?? null,
        pet.birthDate ?? null,
        pet.photoUrl ?? null,
      ],
    );

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
        id,
        owner_id,
        name,
        species,
        breed,
        birth_date,
        photo_url,
        created_at,
        updated_at
       FROM pets
       WHERE id = ? AND owner_id = ?`,
      [id, ownerId],
    );

    if (rows.length === 0) {
      throw new Error("Pet could not be created");
    }

    return this.toPet(rows[0]);
  }

  async list(ownerId: string): Promise<Pet[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
        id,
        owner_id,
        name,
        species,
        breed,
        birth_date,
        photo_url,
        created_at,
        updated_at
       FROM pets
       WHERE owner_id = ?
       ORDER BY created_at DESC`,
      [ownerId],
    );

    return rows.map((row) => this.toPet(row));
  }

  private toPet(row: RowDataPacket): Pet {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      species: row.species,
      ...(row.breed ? { breed: row.breed } : {}),
      ...(row.birth_date
        ? {
            birthDate:
              row.birth_date instanceof Date
                ? row.birth_date.toISOString().slice(0, 10)
                : String(row.birth_date),
          }
        : {}),
      ...(row.photo_url ? { photoUrl: row.photo_url } : {}),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    };
  }
}
