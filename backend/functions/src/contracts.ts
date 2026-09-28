// Shared client/backend contract. This module must remain free of Admin SDK imports.
export type Role = "OWNER" | "CLINIC";
export type AccountStatus = "PENDING" | "ACTIVE" | "DISABLED";
export interface ProfileInput {
  displayName: string;
  phone?: string;
}
export interface Session {
  uid: string;
  role: Role;
  displayName: string;
  email: string;
  phone?: string;
  clinicId?: string;
}
export interface PetInput {
  name: string;
  species: string;
  identifyingDetails: string;
}

export interface Pet {
  petId: string;
  ownerId: string;
  name: string;
  species: string;
  identifyingDetails: string;
  photoPath?: string;
  isLost: boolean;
  archivedAt?: string;
}

export function parseProfile(value: unknown): ProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid profile");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["displayName", "phone"].includes(key)))
    throw new Error("Unexpected profile field");
  if (
    typeof data.displayName !== "string" ||
    !data.displayName.trim() ||
    data.displayName.trim().length > 80
  )
    throw new Error("Display name must contain 1–80 characters");
  if (
    data.phone !== undefined &&
    (typeof data.phone !== "string" || data.phone.trim().length > 30)
  )
    throw new Error("Phone must contain at most 30 characters");
  return {
    displayName: data.displayName.trim(),
    ...(typeof data.phone === "string" ? { phone: data.phone.trim() } : {}),
  };
}

export function parsePet(value: unknown): PetInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid pet");

  const data = value as Record<string, unknown>;

  if (
    Object.keys(data).some(
      (key) => !["name", "species", "identifyingDetails"].includes(key),
    )
  )
    throw new Error("Unexpected pet field");

  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.trim().length > 80
  )
    throw new Error("Pet name must contain 1–80 characters");

  if (
    typeof data.species !== "string" ||
    !data.species.trim() ||
    data.species.trim().length > 50
  )
    throw new Error("Species must contain 1–50 characters");

  if (
    typeof data.identifyingDetails !== "string" ||
    !data.identifyingDetails.trim() ||
    data.identifyingDetails.trim().length > 300
  )
    throw new Error("Identifying details must contain 1–300 characters");

  return {
    name: data.name.trim(),
    species: data.species.trim(),
    identifyingDetails: data.identifyingDetails.trim(),
  };
}
