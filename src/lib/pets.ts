import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { getSessionSync, isLocalTesting } from "@/lib/session";

export type Pet = {
  id: string;
  ownerId: string;
  name: string;
  species: string;
  sex: string;
  breed: string;
  color: string;
  birthdate: string;
  photo: string;
  details: string;
  collar: string;
  finderContactVisible: boolean;
  contactName: string;
  contactMobile: string;
  contactLocation: string;
  createdAt: number;
};

export type NewPetInput = Omit<
  Pet,
  "id" | "ownerId" | "contactLocation" | "createdAt"
> & {
  contactLocation?: string;
  ownerId?: string;
};

const STORAGE_KEY = "petconnect.pets.v1";

export const seedPets: Pet[] = isLocalTesting
  ? [
      {
        id: "PC-TEST-10001",
        ownerId: "local-test-owner",
        name: "Test Pet",
        species: "Dog",
        sex: "Female",
        breed: "Mixed breed",
        color: "Brown",
        birthdate: "2021-05-12",
        photo: "",
        details: "Local emulator test pet",
        collar: "Red collar",
        finderContactVisible: true,
        contactName: "Local Test Owner",
        contactMobile: "+63 917 111 1111",
        contactLocation: "Tagum City",
        createdAt: Date.now(),
      },
    ]
  : [];

type PetQrPayload = Pick<
  Pet,
  | "id"
  | "name"
  | "species"
  | "sex"
  | "breed"
  | "color"
  | "birthdate"
  | "details"
  | "collar"
  | "finderContactVisible"
>;

export function encodePetQr(pet: Pet): string {
  const payload: PetQrPayload = {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    sex: pet.sex,
    breed: pet.breed,
    color: pet.color,
    birthdate: pet.birthdate,
    details: pet.details,
    collar: pet.collar,
    finderContactVisible: pet.finderContactVisible,
  };
  return JSON.stringify({ version: 1, pet: payload });
}

export function decodePetQr(value: string): Pet | null {
  try {
    const parsed = JSON.parse(value) as {
      version?: number;
      pet?: Partial<PetQrPayload>;
    };
    const payload = parsed.version === 1 ? parsed.pet : null;
    if (!payload?.id || !/^PC-TAG-\d{4,}$/.test(payload.id)) return null;
    return {
      id: payload.id,
      ownerId: "",
      name: payload.name ?? "Pet",
      species: payload.species ?? "",
      sex: payload.sex ?? "",
      breed: payload.breed ?? "",
      color: payload.color ?? "",
      birthdate: payload.birthdate ?? "",
      photo: "",
      details: payload.details ?? "",
      collar: payload.collar ?? "",
      finderContactVisible: payload.finderContactVisible !== false,
      contactName: "",
      contactMobile: "",
      contactLocation: "",
      createdAt: 0,
    };
  } catch {
    return null;
  }
}

let petsCache: Pet[] | null = null;
const listeners = new Set<() => void>();

let mutationQueue: Promise<unknown> = Promise.resolve();

function mutate<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function notify() {
  listeners.forEach((listener) => listener());
}

async function persist(pets: Pet[]) {
  petsCache = pets;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pets));
  } catch {
    // Storage is best-effort; the in-memory cache still works for this session.
  }
  notify();
}

async function readPets(): Promise<Pet[]> {
  if (petsCache) return petsCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Pet[];
      if (Array.isArray(parsed)) {
        petsCache = parsed.map(normalizePet);
        await persist(petsCache);
        return petsCache;
      }
    }
  } catch {
    // Fall through to seeds.
  }
  petsCache = [...seedPets];
  await persist(petsCache);
  return petsCache;
}

function normalizePet(pet: Pet): Pet {
  return {
    ...pet,
    ownerId: pet.ownerId ?? getSessionSync().user?.userId ?? "",
    details: pet.details ?? "",
    collar: pet.collar ?? "",
    finderContactVisible: pet.finderContactVisible !== false,
  };
}

export async function getPets(): Promise<Pet[]> {
  return readPets();
}

export function getPetsSync(): Pet[] {
  return petsCache ?? [];
}

export function getPetByIdSync(id: string): Pet | null {
  return (petsCache ?? []).find((p) => p.id === id) ?? null;
}

export async function getPetById(id: string): Promise<Pet | null> {
  return (await readPets()).find((p) => p.id === id) ?? null;
}

export function cacheScannedPet(pet: Pet): Promise<void> {
  return mutate(async () => {
    const pets = await readPets();
    if (pets.some((candidate) => candidate.id === pet.id)) return;
    await persist([...pets, pet]);
  });
}

export function createPet(input: NewPetInput): Promise<Pet> {
  return mutate(async () => {
    const pets = await readPets();
    let index = 10000 + Math.floor(Math.random() * 90000);
    let id = `PC-TAG-${index}`;
    const existing = new Set(pets.map((p) => p.id));
    while (existing.has(id)) {
      index = 10000 + Math.floor(Math.random() * 90000);
      id = `PC-TAG-${index}`;
    }
    const pet: Pet = {
      ...input,
      id,
      ownerId: input.ownerId ?? getSessionSync().user?.userId ?? "",
      details: input.details?.trim() || "",
      collar: input.collar?.trim() || "",
      finderContactVisible: input.finderContactVisible !== false,
      contactLocation: input.contactLocation?.trim() || "Tagum City",
      createdAt: Date.now(),
    };
    await persist([...pets, pet]);
    return pet;
  });
}

export function updatePet(
  id: string,
  input: Omit<NewPetInput, "ownerId">,
): Promise<Pet> {
  return mutate(async () => {
    const pets = await readPets();
    const existing = pets.find((p) => p.id === id);
    if (!existing) {
      throw new Error("Pet not found.");
    }
    const updated: Pet = {
      ...existing,
      name: input.name.trim(),
      species: input.species,
      sex: input.sex,
      breed: input.breed.trim(),
      color: input.color.trim(),
      birthdate: input.birthdate,
      photo: input.photo,
      details: input.details.trim(),
      collar: input.collar.trim(),
      finderContactVisible: input.finderContactVisible !== false,
      contactName: input.contactName.trim(),
      contactMobile: input.contactMobile.trim(),
      contactLocation:
        input.contactLocation?.trim() || existing.contactLocation,
    };
    await persist(pets.map((p) => (p.id === id ? updated : p)));
    return updated;
  });
}

export function subscribePets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePets(): Pet[] {
  const [pets, setPets] = useState<Pet[]>(getPetsSync());

  useEffect(() => {
    let active = true;
    readPets().then((loaded) => {
      if (active) setPets(loaded);
    });
    const unsubscribe = subscribePets(() => {
      if (active) setPets(getPetsSync());
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return pets;
}

/**
 * Returns the pet for `id`, or `undefined` while it is still loading from
 * storage, and `null` when no matching pet exists.
 */
export function usePetById(id: string): Pet | null | undefined {
  const [pet, setPet] = useState<Pet | null | undefined>(
    getPetByIdSync(id) ?? undefined,
  );

  useEffect(() => {
    let active = true;
    setPet(getPetByIdSync(id) ?? undefined);
    getPetById(id).then((found) => {
      if (active) setPet(found ?? null);
    });
    return () => {
      active = false;
    };
  }, [id]);

  return pet;
}

export function useMyPets(userId?: string | null): Pet[] {
  const pets = usePets();
  if (!userId) return [];
  return pets.filter((pet) => pet.ownerId === userId);
}

export function formatBirthdate(birthdate: string): string {
  const [year, month, day] = birthdate.split("-");
  if (!year || !month || !day) return birthdate;
  return `${day}/${month}/${year}`;
}

export function petAge(pet: Pet): string {
  const [year, month, day] = pet.birthdate.split("-").map(Number);
  if (!year || !month || !day) return "Unknown age";
  const now = new Date();
  const birth = new Date(year, month - 1, day);
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  if (age < 0) return "Puppy / Kitten";
  if (age === 0) return "Under 1 year";
  return `${age} years`;
}
