import { randomUUID } from "node:crypto";
import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Pet, PetInput } from "../../../shared/contracts.js";

type PetRow = RowDataPacket & {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  age_label: string | null;
  identifying_details: string | null;
  photo_url: string | null;
  created_at: Date;
  updated_at: Date;
};

const columns =
  "id, name, species, breed, sex, age_label, identifying_details, photo_url, created_at, updated_at";

export class PetValidationError extends Error {}

function textField(
  value: unknown,
  label: string,
  max: number,
  required = false,
) {
  if (typeof value !== "string")
    throw new PetValidationError(`Invalid ${label}.`);
  const text = value.trim();
  if ((required && !text) || text.length > max)
    throw new PetValidationError(`Invalid ${label}.`);
  return text;
}

function validate(input: unknown, partial: boolean): Partial<PetInput> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PetValidationError("Invalid pet details.");
  const data = input as Record<string, unknown>;
  const result: Partial<PetInput> = {};
  if (!partial || data.name !== undefined)
    result.name = textField(data.name, "pet name", 100, true);
  if (!partial || data.species !== undefined)
    result.species = textField(data.species, "species", 50, true);
  if (data.breed !== undefined)
    result.breed = textField(data.breed, "breed", 100);
  if (data.sex !== undefined) {
    if (data.sex !== "" && data.sex !== "Male" && data.sex !== "Female")
      throw new PetValidationError("Invalid sex.");
    result.sex = data.sex;
  }
  if (data.ageLabel !== undefined)
    result.ageLabel = textField(data.ageLabel, "age", 50);
  if (data.identifyingDetails !== undefined)
    result.identifyingDetails = textField(
      data.identifyingDetails,
      "identifying details",
      2000,
    );
  if (partial && Object.keys(result).length === 0)
    throw new PetValidationError("No pet details to update.");
  return result;
}

function toPet(row: PetRow): Pet {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    breed: row.breed || "",
    sex: (row.sex as Pet["sex"]) || "",
    ageLabel: row.age_label || "",
    identifyingDetails: row.identifying_details || "",
    photoUrl: row.photo_url,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class Pets {
  constructor(private pool: Pool) {}

  async list(ownerId: string): Promise<Pet[]> {
    const [rows] = await this.pool.query<PetRow[]>(
      `SELECT ${columns} FROM pets WHERE owner_id = ? ORDER BY created_at DESC, id DESC`,
      [ownerId],
    );
    return rows.map(toPet);
  }

  async get(ownerId: string, id: string): Promise<Pet | null> {
    const [rows] = await this.pool.query<PetRow[]>(
      `SELECT ${columns} FROM pets WHERE id = ? AND owner_id = ?`,
      [id, ownerId],
    );
    return rows.length ? toPet(rows[0]) : null;
  }

  async create(ownerId: string, input: unknown): Promise<Pet> {
    const data = validate(input, false);
    const id = `PC-${randomUUID().toUpperCase()}`;
    await this.pool.query(
      "INSERT INTO pets (id, owner_id, name, species, breed, sex, age_label, identifying_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        ownerId,
        data.name,
        data.species,
        data.breed || null,
        data.sex || null,
        data.ageLabel || null,
        data.identifyingDetails || null,
      ],
    );
    return (await this.get(ownerId, id))!;
  }

  async update(
    ownerId: string,
    id: string,
    input: unknown,
  ): Promise<Pet | null> {
    const data = validate(input, true);
    const fields: Record<keyof PetInput, string> = {
      name: "name",
      species: "species",
      breed: "breed",
      sex: "sex",
      ageLabel: "age_label",
      identifyingDetails: "identifying_details",
    };
    const entries = Object.entries(data) as [keyof PetInput, string][];
    await this.pool.query(
      `UPDATE pets SET ${entries.map(([key]) => `${fields[key]} = ?`).join(", ")} WHERE id = ? AND owner_id = ?`,
      [...entries.map(([, value]) => value || null), id, ownerId],
    );
    return this.get(ownerId, id);
  }

  async setPhoto(
    ownerId: string,
    id: string,
    photoUrl: string | null,
  ): Promise<Pet | null> {
    await this.pool.query(
      "UPDATE pets SET photo_url = ? WHERE id = ? AND owner_id = ?",
      [photoUrl, id, ownerId],
    );
    return this.get(ownerId, id);
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      "DELETE FROM pets WHERE id = ? AND owner_id = ?",
      [id, ownerId],
    );
    return result.affectedRows > 0;
  }
}
