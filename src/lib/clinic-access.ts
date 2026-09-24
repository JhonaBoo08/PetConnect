import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { addClinicNotification } from '@/lib/clinic-notifications';
import { addNotification } from '@/lib/notifications';
import { type Pet } from '@/lib/pets';
import { isLocalTesting } from '@/lib/session';

export type AccessStatus = 'active' | 'requested' | 'declined';

export type ClinicAccess = {
  clinicId: string;
  clinicName: string;
  petId: string;
  petName: string;
  status: AccessStatus;
  ownerName: string;
  updatedAt: number;
};

export type ClinicAccessRequest = {
  clinicId: string;
  clinicName: string;
  petId: string;
  petName: string;
};

const ACCESS_KEY = 'petconnect.clinicAccess.v1';

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function accessKey(clinicId: string, petId: string): string {
  return `${clinicId}:${petId}`;
}

function timestampLabel(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  if (now.toDateString() === date.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
}

let accessCache: Record<string, ClinicAccess> = {};
let ready = false;
let loadPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function persist() {
  try {
    await AsyncStorage.setItem(ACCESS_KEY, JSON.stringify(accessCache));
  } catch {
    // Storage is best-effort; the in-memory cache still works for this session.
  }
  notify();
}

async function load(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ACCESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, ClinicAccess>;
      if (parsed && typeof parsed === 'object') accessCache = parsed;
    }
    if (isLocalTesting) {
      accessCache[accessKey('local-test-clinic', 'PC-TEST-10001')] = {
        clinicId: 'local-test-clinic',
        clinicName: 'Local Test Vet Clinic',
        petId: 'PC-TEST-10001',
        petName: 'Test Pet',
        status: 'active',
        ownerName: 'Local Test Owner',
        updatedAt: Date.now(),
      };
      await persist();
    }
  } catch {
    // Fall through to empty state.
  } finally {
    ready = true;
    notify();
  }
}

let mutationQueue: Promise<unknown> = Promise.resolve();

function mutate<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function ensureLoaded(): Promise<void> {
  if (ready) return Promise.resolve();
  loadPromise ??= load();
  return loadPromise;
}

export function useClinicAccess(): ClinicAccess[] {
  const [access, setAccess] = useState<ClinicAccess[]>(Object.values(accessCache));

  useEffect(() => {
    let active = true;
    ensureLoaded().then(() => {
      if (active) setAccess(Object.values(accessCache));
    });
    function update() {
      if (active) setAccess(Object.values(accessCache));
    }
    listeners.add(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  return access;
}

export function getClinicAccessSync(clinicId: string, petId: string): ClinicAccess | null {
  return accessCache[accessKey(clinicId, petId)] ?? null;
}

export function requestPetAccess(clinicId: string, clinicName: string, pet: Pet): Promise<void> {
  return mutate(async () => {
    await ensureLoaded();
    const existing = accessCache[accessKey(clinicId, pet.id)];
    const entry: ClinicAccess = {
      clinicId,
      clinicName,
      petId: pet.id,
      petName: pet.name,
      status: existing?.status === 'active' ? 'active' : 'requested',
      ownerName: pet.contactName,
      updatedAt: Date.now(),
    };
    accessCache[accessKey(clinicId, pet.id)] = entry;
    await persist();

    await addNotification({
      kind: 'access-request',
      title: 'Health access requested',
      description: `${clinicName} is asking to view ${pet.name}'s health records.`,
      timestamp: timestampLabel(entry.updatedAt),
      accessRequest: {
        clinicId,
        clinicName,
        petId: pet.id,
        petName: pet.name,
      },
    });
    await addClinicNotification({
      kind: 'access',
      title: `Access requested for ${pet.name}`,
      description: `Waiting for ${pet.contactName} to approve health record access.`,
      timestamp: timestampLabel(entry.updatedAt),
    });
  });
}

export function respondToAccessRequest(
  request: ClinicAccessRequest,
  status: Extract<AccessStatus, 'active' | 'declined'>,
): Promise<void> {
  return mutate(async () => {
    await ensureLoaded();
    const existing = accessCache[accessKey(request.clinicId, request.petId)];
    const entry: ClinicAccess = {
      clinicId: request.clinicId,
      clinicName: request.clinicName,
      petId: request.petId,
      petName: request.petName,
      status,
      ownerName: existing?.ownerName ?? '',
      updatedAt: Date.now(),
    };
    accessCache[accessKey(request.clinicId, request.petId)] = entry;
    await persist();

    const verdict =
      status === 'active'
        ? `approved ${request.petName}'s health record access.`
        : `declined ${request.petName}'s health record access.`;
    await addClinicNotification({
      kind: 'access',
      title: status === 'active' ? 'Access approved' : 'Access declined',
      description: `${entry.ownerName || 'The owner'} ${verdict}`,
      timestamp: timestampLabel(entry.updatedAt),
    });
  });
}