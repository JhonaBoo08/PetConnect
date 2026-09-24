import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type Pet = {
  id: string;
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

export type NewPetInput = Omit<Pet, 'id' | 'contactLocation' | 'createdAt'> & {
  contactLocation?: string;
};

const STORAGE_KEY = 'petconnect.pets.v1';

export const seedPets: Pet[] = [
  {
    id: 'PC-TAG-10482',
    name: 'Bantay',
    species: 'Dog',
    sex: 'Male',
    breed: 'Golden Retriever',
    color: 'Golden',
    birthdate: '2023-06-20',
    photo: '',
    details: 'Small white mark on chest',
    collar: 'Blue collar',
    finderContactVisible: true,
    contactName: 'Raven Babiano',
    contactMobile: '+63 917 000 0042',
    contactLocation: 'Tagum City',
    createdAt: 0,
  },
  {
    id: 'PC-TAG-10483',
    name: 'Mingming',
    species: 'Cat',
    sex: 'Female',
    breed: 'Orange Tabby',
    color: 'Orange',
    birthdate: '2024-03-11',
    photo: '',
    details: 'Green eyes',
    collar: 'No collar',
    finderContactVisible: true,
    contactName: 'Raven Babiano',
    contactMobile: '+63 917 000 0042',
    contactLocation: 'Tagum City',
    createdAt: 0,
  },
];

let petsCache: Pet[] | null = null;
const listeners = new Set<() => void>();

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
    details: pet.details ?? '',
    collar: pet.collar ?? '',
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

export async function createPet(input: NewPetInput): Promise<Pet> {
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
    details: input.details?.trim() || '',
    collar: input.collar?.trim() || '',
    finderContactVisible: input.finderContactVisible !== false,
    contactLocation: input.contactLocation?.trim() || 'Tagum City',
    createdAt: Date.now(),
  };
  await persist([...pets, pet]);
  return pet;
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

export function formatBirthdate(birthdate: string): string {
  const [year, month, day] = birthdate.split('-');
  if (!year || !month || !day) return birthdate;
  return `${day}/${month}/${year}`;
}

export function petAge(pet: Pet): string {
  const [year, month, day] = pet.birthdate.split('-').map(Number);
  if (!year || !month || !day) return 'Unknown age';
  const now = new Date();
  const birth = new Date(year, month - 1, day);
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  if (age < 0) return 'Puppy / Kitten';
  if (age === 0) return 'Under 1 year';
  return `${age} years`;
}