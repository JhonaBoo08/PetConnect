import { File as ExpoFile } from "expo-file-system";
import { Platform } from "react-native";
import type { Pet, PetInput } from "../../../shared/contracts";
import { authenticatedFetch, getApiBaseUrl } from "./auth";
import {
  cachedRequest,
  peekCached,
  setCached,
  updateCached,
} from "./resource-cache";

const petsCacheKey = "owner:pets";

export const petPhotoUri = (url: string | null) =>
  url ? `${getApiBaseUrl()}${url}` : null;

export const peekPetsCached = () => peekCached<Pet[]>(petsCacheKey);
export const peekPets = () => peekPetsCached() ?? [];

export async function listPets(
  options: { force?: boolean } = {},
): Promise<Pet[]> {
  return cachedRequest(
    petsCacheKey,
    async () => {
      const result = await authenticatedFetch<{ pets: Pet[] }>("/v1/pets");
      return result.pets;
    },
    { ttlMs: 20_000, force: options.force },
  );
}

export async function getPet(id: string): Promise<Pet> {
  const cached = peekPetsCached()?.find((pet) => pet.id === id);
  if (cached) return cached;

  const pet = await authenticatedFetch<Pet>(
    `/v1/pets/${encodeURIComponent(id)}`,
  );

  updateCached<Pet[]>(petsCacheKey, (current) =>
    current ? [pet, ...current.filter((item) => item.id !== pet.id)] : [pet],
  );

  return pet;
}

export async function createPet(input: PetInput): Promise<Pet> {
  const pet = await authenticatedFetch<Pet>("/v1/pets", {
    method: "POST",
    body: JSON.stringify(input),
  });

  updateCached<Pet[]>(petsCacheKey, (current) =>
    current ? [pet, ...current.filter((item) => item.id !== pet.id)] : [pet],
  );

  return pet;
}

export async function updatePet(id: string, input: PetInput): Promise<Pet> {
  const pet = await authenticatedFetch<Pet>(
    `/v1/pets/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  updateCached<Pet[]>(petsCacheKey, (current) =>
    current?.map((item) => (item.id === pet.id ? pet : item)),
  );

  return pet;
}

export async function deletePet(id: string): Promise<void> {
  await authenticatedFetch<void>(`/v1/pets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  updateCached<Pet[]>(petsCacheKey, (current) =>
    current?.filter((item) => item.id !== id),
  );
}

export async function removePetPhoto(id: string): Promise<Pet> {
  const pet = await authenticatedFetch<Pet>(
    `/v1/pets/${encodeURIComponent(id)}/photo`,
    { method: "DELETE" },
  );

  updateCached<Pet[]>(petsCacheKey, (current) =>
    current?.map((item) => (item.id === pet.id ? pet : item)),
  );

  return pet;
}

export async function uploadPetPhoto(id: string, uri: string): Promise<Pet> {
  const form = new FormData();

  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();

    if (blob.size > 5 * 1024 * 1024) {
      throw new Error("Photo must be under 5 MB.");
    }

    form.append("file", blob, "pet.jpg");
  } else {
    const file = new ExpoFile(uri);

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Photo must be under 5 MB.");
    }

    form.append("file", file);
  }

  const pet = await authenticatedFetch<Pet>(
    `/v1/pets/${encodeURIComponent(id)}/photo`,
    {
      method: "PUT",
      body: form,
    },
  );

  updateCached<Pet[]>(petsCacheKey, (current) =>
    current?.map((item) => (item.id === pet.id ? pet : item)),
  );

  return pet;
}

export const primePets = (pets: Pet[]) => setCached(petsCacheKey, pets);
