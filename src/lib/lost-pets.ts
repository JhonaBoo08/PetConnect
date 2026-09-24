import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { haversineKm, type LocationSource } from '@/lib/geolocation';
import { firebaseClient } from '@/services/firebase/client';

export type AlertStatus = 'ACTIVE' | 'FOUND' | 'CLOSED';
export type ReportKind = 'Lost' | 'Found';

export type LostPetAlert = {
  id: string;
  petId: string;
  ownerId: string;
  petName: string;
  petPhoto: string;
  lastSeenDescription: string;
  latitude: number | null;
  longitude: number | null;
  lastSeenAccuracy: number | null;
  locationName: string;
  locationSource: LocationSource | null;
  locationUpdatedAt: number | null;
  description: string;
  photoUrl: string;
  reportKind: ReportKind;
  status: AlertStatus;
  foundAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type NewLostPetAlertInput = Omit<
  LostPetAlert,
  'id' | 'status' | 'foundAt' | 'createdAt' | 'updatedAt'
>;

export type SelectedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: string | null;
  source: LocationSource;
  updatedAt: number;
};

const ALERTS_KEY = 'petconnect.lostPetAlerts.v1';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const seedLostPetAlerts: LostPetAlert[] = [
  {
    id: 'alt-mingming',
    petId: 'PC-NEAR-10001',
    ownerId: 'seed-owner-1',
    petName: 'Mingming',
    petPhoto: '',
    lastSeenDescription: 'Apokon, Tagum City',
    latitude: 7.4204,
    longitude: 125.7965,
    locationName: 'Apokon, Tagum City',
    locationSource: null,
    locationUpdatedAt: null,
    lastSeenAccuracy: null,
    description: 'Orange tabby with blue collar',
    photoUrl: '',
    reportKind: 'Lost',
    status: 'ACTIVE',
    foundAt: null,
    createdAt: Date.now() - 2 * HOUR_MS,
    updatedAt: Date.now() - 2 * HOUR_MS,
  },
  {
    id: 'alt-pup',
    petId: 'PC-NEAR-10002',
    ownerId: 'seed-owner-2',
    petName: 'Unnamed pup',
    petPhoto: '',
    lastSeenDescription: 'Freedom Park, Tagum',
    latitude: 7.4475,
    longitude: 125.8087,
    locationName: 'Freedom Park, Tagum',
    locationSource: null,
    locationUpdatedAt: null,
    lastSeenAccuracy: null,
    description: 'Brown aspin with red collar, friendly',
    photoUrl: '',
    reportKind: 'Found',
    status: 'ACTIVE',
    foundAt: null,
    createdAt: Date.now() - 5 * HOUR_MS,
    updatedAt: Date.now() - 5 * HOUR_MS,
  },
  {
    id: 'alt-coco',
    petId: 'PC-NEAR-10003',
    ownerId: 'seed-owner-3',
    petName: 'Coco',
    petPhoto: '',
    lastSeenDescription: 'Magugpo East, Tagum City',
    latitude: 7.4044,
    longitude: 125.7775,
    locationName: 'Magugpo East, Tagum City',
    locationSource: null,
    locationUpdatedAt: null,
    lastSeenAccuracy: null,
    description: 'White shih tzu, pink leash',
    photoUrl: '',
    reportKind: 'Lost',
    status: 'ACTIVE',
    foundAt: null,
    createdAt: Date.now() - DAY_MS,
    updatedAt: Date.now() - DAY_MS,
  },
];

let alertsCache: LostPetAlert[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function persist(alerts: LostPetAlert[]) {
  alertsCache = alerts;
  try {
    await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch {
    // Storage is best-effort; the in-memory cache still works for this session.
  }
  notify();
}

function normalizeAlert(alert: LostPetAlert): LostPetAlert {
  return {
    ...alert,
    latitude: alert.latitude ?? null,
    longitude: alert.longitude ?? null,
    lastSeenAccuracy: alert.lastSeenAccuracy ?? null,
    locationSource: alert.locationSource ?? null,
    locationUpdatedAt: alert.locationUpdatedAt ?? null,
  };
}

async function readAlerts(): Promise<LostPetAlert[]> {
  if (alertsCache) return alertsCache;
  try {
    const raw = await AsyncStorage.getItem(ALERTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LostPetAlert[];
      if (Array.isArray(parsed)) {
        alertsCache = parsed.map(normalizeAlert);
        return alertsCache;
      }
    }
  } catch {
    // Fall through to seeds.
  }
  alertsCache = [...seedLostPetAlerts];
  await persist(alertsCache);
  return alertsCache;
}

export async function getLostPetAlerts(): Promise<LostPetAlert[]> {
  return readAlerts();
}

export function getLostPetAlertsSync(): LostPetAlert[] {
  return alertsCache ?? [];
}

export function subscribeLostPetAlerts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLostPetAlerts(): LostPetAlert[] {
  const [alerts, setAlerts] = useState<LostPetAlert[]>(getLostPetAlertsSync());

  useEffect(() => {
    let active = true;
    readAlerts().then((loaded) => {
      if (active) setAlerts(loaded);
    });
    const unsubscribe = subscribeLostPetAlerts(() => {
      if (active) setAlerts(getLostPetAlertsSync());
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return alerts;
}

export function currentOwnerId(): string {
  try {
    return firebaseClient().auth.currentUser?.uid ?? 'local-owner';
  } catch {
    return 'local-owner';
  }
}

export function newAlertId(): string {
  return `alt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createLostPetAlert(
  input: NewLostPetAlertInput,
): Promise<LostPetAlert> {
  const alerts = await readAlerts();
  const now = Date.now();
  const alert: LostPetAlert = {
    ...input,
    id: newAlertId(),
    status: 'ACTIVE',
    foundAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await persist([alert, ...alerts]);
  return alert;
}

export async function updateLostPetAlert(
  id: string,
  input: NewLostPetAlertInput,
): Promise<LostPetAlert> {
  const alerts = await readAlerts();
  const existing = alerts.find((alert) => alert.id === id);
  if (!existing) throw new Error('Lost pet alert not found.');
  const updated: LostPetAlert = {
    ...existing,
    ...input,
    id,
    updatedAt: Date.now(),
  };
  await persist(
    alerts.map((alert) => (alert.id === id ? updated : alert)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  );
  return updated;
}

export async function markAlertFound(id: string): Promise<void> {
  const alerts = await readAlerts();
  const now = Date.now();
  const next = alerts.map((alert) =>
    alert.id === id
      ? { ...alert, status: 'FOUND' as const, foundAt: now, updatedAt: now }
      : alert,
  );
  await persist(
    next.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  );
}

export async function closeAlert(id: string): Promise<void> {
  const alerts = await readAlerts();
  const now = Date.now();
  const next = alerts.map((alert) =>
    alert.id === id
      ? { ...alert, status: 'CLOSED' as const, updatedAt: now }
      : alert,
  );
  await persist(next);
}

export function nearbyAlertsSorted(
  alerts: LostPetAlert[],
  origin: { latitude: number; longitude: number } | null,
): LostPetAlert[] {
  const active = alerts.filter((alert) => alert.status === 'ACTIVE');
  if (!origin) {
    return [...active].sort((a, b) => b.createdAt - a.createdAt);
  }
  return active
    .map((alert) => ({ alert, distance: alertDistanceKm(alert, origin) }))
    .sort((a, b) => {
      if (a.distance === null && b.distance === null) {
        return b.alert.createdAt - a.alert.createdAt;
      }
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    })
    .map((entry) => entry.alert);
}

export function activeLostAlertForPet(
  alerts: LostPetAlert[],
  petId: string,
): LostPetAlert | null {
  return (
    alerts.find(
      (alert) =>
        alert.petId === petId &&
        alert.reportKind === 'Lost' &&
        alert.status === 'ACTIVE',
    ) ?? null
  );
}

export function alertDistanceKm(
  alert: LostPetAlert,
  origin: { latitude: number; longitude: number } | null,
): number | null {
  if (!origin || alert.latitude === null || alert.longitude === null) return null;
  return haversineKm(origin, { latitude: alert.latitude, longitude: alert.longitude });
}

export function timeAgo(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return 'Just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(elapsed / HOUR_MS);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function alertSummary(alert: LostPetAlert): string {
  const where = alert.locationName || alert.lastSeenDescription;
  return where ? `Last seen: ${where}` : 'Last seen location not specified.';
}