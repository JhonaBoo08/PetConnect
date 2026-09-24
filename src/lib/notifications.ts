import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type NotificationRoute =
  | '/reminder-details'
  | { pathname: '/record-details'; params: { record: string; name: string } }
  | { pathname: '/reminder-details'; params: { reminder: string } }
  | { pathname: '/alert-details'; params: { id: string } };

export type AppNotification = {
  id: string;
  kind: 'booster' | 'lost-pet' | 'found' | 'record';
  title: string;
  description: string;
  timestamp: string;
  unread: boolean;
  route: NotificationRoute;
};

const NOTIFICATIONS_KEY = 'petconnect.notifications.v1';

const seedNotifications: AppNotification[] = [
  {
    id: 'booster',
    kind: 'booster',
    title: 'Booster due soon',
    description: "Mingming's FVRCP booster is due in 3 days.",
    timestamp: '2h',
    unread: true,
    route: { pathname: '/reminder-details', params: { reminder: 'rem-fvrcp' } },
  },
  {
    id: 'lost-pet',
    kind: 'lost-pet',
    title: 'Lost pet nearby',
    description: 'A brown Aspin was last seen near Mankilam.',
    timestamp: '4h',
    unread: true,
    route: { pathname: '/alert-details', params: { id: 'alt-pup' } },
  },
  {
    id: 'verified-record',
    kind: 'record',
    title: 'Health record verified',
    description: "Tagum Pet Care verified Bantay's anti-rabies record.",
    timestamp: 'Yesterday',
    unread: false,
    route: {
      pathname: '/record-details',
      params: { record: 'anti-rabies', name: 'Bantay' },
    },
  },
];

let notificationsCache: AppNotification[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function persist(notifications: AppNotification[]) {
  notificationsCache = notifications;
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch {
    // Best-effort persistence.
  }
  notify();
}

async function readNotifications(): Promise<AppNotification[]> {
  if (notificationsCache) return notificationsCache;
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppNotification[];
      if (Array.isArray(parsed)) {
        notificationsCache = parsed;
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

export function useNotifications(): AppNotification[] {
  const [notifications, setNotifications] = useState<AppNotification[]>(
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

export async function addNotification(
  notification: Omit<AppNotification, 'unread'>,
): Promise<void> {
  const notifications = await readNotifications();
  await persist([
    {
      ...notification,
      id: notification.id || `ntf-${Date.now().toString(36)}`,
      unread: true,
    },
    ...notifications,
  ]);
}

export async function readNotification(id: string): Promise<void> {
  const notifications = await readNotifications();
  await persist(
    notifications.map((n) => (n.id === id ? { ...n, unread: false } : n)),
  );
}