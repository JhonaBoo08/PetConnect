import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type ClinicNotificationKind = 'access' | 'record' | 'system';

export type ClinicNotification = {
  id: string;
  kind: ClinicNotificationKind;
  title: string;
  description: string;
  timestamp: string;
  unread: boolean;
};

const NOTIFICATIONS_KEY = 'petconnect.clinicNotifications.v1';

const seedNotifications: ClinicNotification[] = [
  {
    id: 'clinic-welcome',
    kind: 'system',
    title: 'Welcome to your clinic workspace',
    description: 'Scan a pet tag to request access to its health records.',
    timestamp: 'Just now',
    unread: true,
  },
];

let notificationsCache: ClinicNotification[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function dedupeById(list: ClinicNotification[]): ClinicNotification[] {
  const seen = new Set<string>();
  const result: ClinicNotification[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

async function persist(notifications: ClinicNotification[]) {
  notificationsCache = notifications;
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch {
    // Best-effort persistence.
  }
  notify();
}

async function readNotifications(): Promise<ClinicNotification[]> {
  if (notificationsCache) return notificationsCache;
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ClinicNotification[];
      if (Array.isArray(parsed)) {
        const deduped = dedupeById(parsed);
        notificationsCache = deduped;
        if (deduped.length !== parsed.length) await persist(deduped);
        return notificationsCache;
      }
    }
  } catch {
    // Fall through to seeds.
  }
  notificationsCache = [...seedNotifications];
  await persist(notificationsCache);
  return notificationsCache;
}

export function useClinicNotifications(): ClinicNotification[] {
  const [notifications, setNotifications] = useState<ClinicNotification[]>(
    notificationsCache ?? [],
  );

  useEffect(() => {
    let active = true;
    readNotifications().then((loaded) => {
      if (active) setNotifications(loaded);
    });
    function update() {
      if (active) setNotifications(notificationsCache ?? []);
    }
    listeners.add(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  return notifications;
}

export async function addClinicNotification(
  notification: Omit<ClinicNotification, 'unread' | 'id'> & { id?: string },
): Promise<void> {
  const notifications = await readNotifications();
  const id =
    notification.id ||
    `cntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await persist([
    { ...notification, id, unread: true },
    ...notifications.filter((existing) => existing.id !== id),
  ]);
}

export async function readClinicNotification(id: string): Promise<void> {
  const notifications = await readNotifications();
  await persist(
    notifications.map((n) => (n.id === id ? { ...n, unread: false } : n)),
  );
}

export async function markAllClinicNotificationsRead(): Promise<void> {
  const notifications = await readNotifications();
  if (notifications.some((n) => n.unread)) {
    await persist(notifications.map((n) => ({ ...n, unread: false })));
  }
}