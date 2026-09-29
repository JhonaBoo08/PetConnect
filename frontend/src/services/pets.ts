import { Platform } from "react-native";
import type { Pet, PetInput } from "../../../shared/contracts";
import { authenticatedFetch, getApiBaseUrl } from "./auth";

export const petPhotoUri = (url: string | null) =>
  url ? `${getApiBaseUrl()}${url}` : null;

export async function listPets(): Promise<Pet[]> {
  const result = await authenticatedFetch<{ pets: Pet[] }>("/v1/pets");
  return result.pets;
}

export const getPet = (id: string) =>
  authenticatedFetch<Pet>(`/v1/pets/${encodeURIComponent(id)}`);

export const createPet = (input: PetInput) =>
  authenticatedFetch<Pet>("/v1/pets", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updatePet = (id: string, input: PetInput) =>
  authenticatedFetch<Pet>(`/v1/pets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const deletePet = (id: string) =>
  authenticatedFetch<void>(`/v1/pets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const removePetPhoto = (id: string) =>
  authenticatedFetch<Pet>(`/v1/pets/${encodeURIComponent(id)}/photo`, {
    method: "DELETE",
  });

export async function uploadPetPhoto(id: string, uri: string): Promise<Pet> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    if (blob.size > 5 * 1024 * 1024)
      throw new Error("Photo must be under 5 MB.");
    form.append("file", blob, "pet.jpg");
  } else {
    form.append("file", {
      uri,
      name: "pet.jpg",
      type: "image/jpeg",
    } as unknown as Blob);
  }
  return authenticatedFetch<Pet>(`/v1/pets/${encodeURIComponent(id)}/photo`, {
    method: "PUT",
    body: form,
  });
}
