import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { dateToIso, isoToFullMonthDay, parseIsoDate } from '@/lib/date';

export type HealthRecordType = 'Vaccination' | 'Checkup' | 'Medication' | 'Other';

export type ReminderNotificationTiming = '1 week before' | '1 day before' | 'On the due date';

export type HealthRecord = {
  id: string;
  petId: string;
  petName: string;
  recordType: HealthRecordType;
  recordName: string;
  recordDate: string;
  veterinaryClinic: string;
  notes: string;
  nextDueDate: string | null;
  clinicId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type NewHealthRecordInput = Omit<
  HealthRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export type NewHealthReminderInput = {
  petId: string;
  petName: string;
  title: string;
  type: HealthRecordType;
  dueDate: string;
  time: string;
  notificationTiming: ReminderNotificationTiming;
  clinicName: string;
  description?: string;
};

export type HealthReminder = {
  id: string;
  petId: string;
  petName: string;
  recordId: string | null;
  title: string;
  type: HealthRecordType;
  description: string;
  dueDate: string;
  time: string;
  notificationTiming: ReminderNotificationTiming;
  clinicId: string | null;
  clinicName: string;
  completedAt: string | null;
  rescheduledAt: number | null;
  createdAt: number;
  updatedAt: number;
};

const RECORDS_KEY = 'petconnect.healthRecords.v1';
const REMINDERS_KEY = 'petconnect.healthReminders.v1';

export const defaultClinicName = 'Tagum Pet Care Clinic';

export const recordTypes: HealthRecordType[] = [
  'Vaccination',
  'Checkup',
  'Medication',
  'Other',
];

export const reminderTimes = ['9:30 AM', '10:00 AM', '2:00 PM'];

export const reminderNotificationTimings: ReminderNotificationTiming[] = [
  '1 week before',
  '1 day before',
  'On the due date',
];

type StoredReminder = Omit<
  HealthReminder,
  | 'type'
  | 'description'
  | 'notificationTiming'
  | 'clinicId'
  | 'clinicName'
  | 'completedAt'
  | 'rescheduledAt'
> &
  Partial<
    Pick<
      HealthReminder,
      | 'type'
      | 'description'
      | 'notificationTiming'
      | 'clinicId'
      | 'clinicName'
      | 'completedAt'
      | 'rescheduledAt'
    >
  >;

function normalizeReminder(reminder: StoredReminder): HealthReminder {
  return {
    type: 'Vaccination',
    description: '',
    notificationTiming: reminderNotificationTimings[1],
    clinicId: null,
    clinicName: defaultClinicName,
    completedAt: null,
    rescheduledAt: null,
    ...reminder,
  };
}

export const seedHealthRecords: HealthRecord[] = [];

export const seedHealthReminders: HealthReminder[] = [];

const legacyDemoPetIds = new Set(['PC-TAG-10482', 'PC-TAG-10483']);

let recordsCache: HealthRecord[] | null = null;
let remindersCache: HealthReminder[] | null = null;
const recordListeners = new Set<() => void>();
const reminderListeners = new Set<() => void>();

function notifyRecords() {
  recordListeners.forEach((listener) => listener());
}

function notifyReminders() {
  reminderListeners.forEach((listener) => listener());
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

async function persistRecords(records: HealthRecord[]) {
  recordsCache = records;
  try {
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Storage is best-effort; the in-memory cache still works for this session.
  }
  notifyRecords();
}

async function persistReminders(reminders: HealthReminder[]) {
  remindersCache = reminders;
  try {
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  } catch {
    // Storage is best-effort; the in-memory cache still works for this session.
  }
  notifyReminders();
}

async function readRecords(): Promise<HealthRecord[]> {
  if (recordsCache) return recordsCache;
  try {
    const raw = await AsyncStorage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HealthRecord[];
      if (Array.isArray(parsed)) {
        recordsCache = parsed.filter((record) => !legacyDemoPetIds.has(record.petId));
        await persistRecords(recordsCache);
        return recordsCache;
      }
    }
  } catch {
    // Fall through to seeds.
  }
  recordsCache = [...seedHealthRecords];
  await persistRecords(recordsCache);
  return recordsCache;
}

async function readReminders(): Promise<HealthReminder[]> {
  if (remindersCache) return remindersCache;
  try {
    const raw = await AsyncStorage.getItem(REMINDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HealthReminder[];
      if (Array.isArray(parsed)) {
        remindersCache = parsed
          .filter((reminder) => !legacyDemoPetIds.has(reminder.petId))
          .map(normalizeReminder);
        await persistReminders(remindersCache);
        return remindersCache;
      }
    }
  } catch {
    // Fall through to seeds.
  }
  remindersCache = [...seedHealthReminders];
  await persistReminders(remindersCache);
  return remindersCache;
}

export async function getHealthRecords(): Promise<HealthRecord[]> {
  return readRecords();
}

export function getHealthRecordsSync(): HealthRecord[] {
  return recordsCache ?? [];
}

export async function getHealthReminders(): Promise<HealthReminder[]> {
  return readReminders();
}

export function getHealthRemindersSync(): HealthReminder[] {
  return remindersCache ?? [];
}

export function subscribeHealthRecords(listener: () => void): () => void {
  recordListeners.add(listener);
  return () => {
    recordListeners.delete(listener);
  };
}

export function subscribeHealthReminders(listener: () => void): () => void {
  reminderListeners.add(listener);
  return () => {
    reminderListeners.delete(listener);
  };
}

export function useHealthRecords(): HealthRecord[] {
  const [records, setRecords] = useState<HealthRecord[]>(getHealthRecordsSync());

  useEffect(() => {
    let active = true;
    readRecords().then((loaded) => {
      if (active) setRecords(loaded);
    });
    const unsubscribe = subscribeHealthRecords(() => {
      if (active) setRecords(getHealthRecordsSync());
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return records;
}

export function useHealthReminders(): HealthReminder[] {
  const [reminders, setReminders] = useState<HealthReminder[]>(getHealthRemindersSync());

  useEffect(() => {
    let active = true;
    readReminders().then((loaded) => {
      if (active) setReminders(loaded);
    });
    const unsubscribe = subscribeHealthReminders(() => {
      if (active) setReminders(getHealthRemindersSync());
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return reminders;
}

const DAY_MS = 86_400_000;

export function reminderDaysUntil(dueDate: string): number {
  const due = parseIsoDate(dueDate);
  if (!due) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

export type ReminderStatus = 'Completed' | 'Overdue' | 'Due today' | 'Due soon' | 'Upcoming';

export function reminderStatus(reminder: HealthReminder): ReminderStatus {
  if (reminder.completedAt) return 'Completed';
  const daysUntil = reminderDaysUntil(reminder.dueDate);
  if (daysUntil < 0) return 'Overdue';
  if (daysUntil === 0) return 'Due today';
  if (daysUntil <= 30) return 'Due soon';
  return 'Upcoming';
}

export function reminderWhen(reminder: HealthReminder): string {
  return `${isoToFullMonthDay(reminder.dueDate)} \u00b7 ${reminder.time}`;
}

export function describeReminder(reminder: HealthReminder): string {
  const pet = reminder.petName;
  const title = reminder.title;
  switch (reminder.type) {
    case 'Checkup':
      return `${pet}'s ${title} is a scheduled checkup to help keep ${pet} in good health.`;
    case 'Medication':
      return `${pet}'s ${title} is scheduled as part of a medication routine.`;
    case 'Other':
      return `${pet}'s ${title} is scheduled on your pet's health calendar.`;
    case 'Vaccination':
    default:
      return `${pet}'s ${title} is scheduled to help keep vaccinations up to date.`;
  }
}

export function newRecordId(): string {
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function upsertRecordReminder(record: HealthRecord) {
  if (!record.nextDueDate) return;
  const id = `rem-${record.id}`;
  const reminders = await readReminders();
  const existing =
    reminders.find((reminder) => reminder.id === id) ?? null;
  const dueDateChanged = existing !== null && existing.dueDate !== record.nextDueDate;
  const completedAt = dueDateChanged ? null : (existing?.completedAt ?? null);
  const rescheduledAt = dueDateChanged ? Date.now() : (existing?.rescheduledAt ?? null);
  const reminder: HealthReminder = {
    id,
    petId: record.petId,
    petName: record.petName,
    recordId: record.id,
    title: record.recordName,
    type: record.recordType,
    description: '',
    dueDate: record.nextDueDate,
    time: existing?.time ?? reminderTimes[0],
    notificationTiming: existing?.notificationTiming ?? reminderNotificationTimings[1],
    clinicId: existing?.clinicId ?? null,
    clinicName: record.veterinaryClinic,
    completedAt,
    rescheduledAt,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  await persistReminders([
    ...reminders.filter((item) => item.id !== id),
    reminder,
  ]);
}

async function removeRecordReminder(recordId: string) {
  const reminders = await readReminders();
  await persistReminders(
    reminders.filter(
      (reminder) =>
        reminder.id !== `rem-${recordId}` && reminder.recordId !== recordId,
    ),
  );
}

export function createHealthRecord(input: NewHealthRecordInput): Promise<HealthRecord> {
  return mutate(async () => {
    const records = await readRecords();
    const now = Date.now();
    const record: HealthRecord = {
      ...input,
      id: newRecordId(),
      clinicId: input.clinicId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await persistRecords([...records, record]);
    if (record.nextDueDate) await upsertRecordReminder(record);
    return record;
  });
}

export function updateHealthRecord(
  id: string,
  input: NewHealthRecordInput,
): Promise<HealthRecord> {
  return mutate(async () => {
    const records = await readRecords();
    const existing = records.find((record) => record.id === id);
    if (!existing) throw new Error('Health record not found.');
    const updated: HealthRecord = {
      ...existing,
      ...input,
      id,
      updatedAt: Date.now(),
    };
    await persistRecords(records.map((record) => (record.id === id ? updated : record)));
    if (updated.nextDueDate) {
      await upsertRecordReminder(updated);
    } else {
      await removeRecordReminder(id);
    }
    return updated;
  });
}

export function deleteHealthRecord(id: string): Promise<void> {
  return mutate(async () => {
    const records = await readRecords();
    await persistRecords(records.filter((record) => record.id !== id));
    await removeRecordReminder(id);
  });
}

export function toggleReminderCompleted(reminderId: string): Promise<void> {
  return mutate(async () => {
    const reminders = await readReminders();
    const now = Date.now();
    const next = reminders.map((reminder) => {
      if (reminder.id !== reminderId) return reminder;
      return {
        ...reminder,
        completedAt: reminder.completedAt ? null : dateToIso(new Date()),
        updatedAt: now,
      };
    });
    await persistReminders(next);
  });
}

export function rescheduleReminder(
  reminderId: string,
  dueDate: string,
  time: string,
): Promise<void> {
  return mutate(async () => {
    const reminders = await readReminders();
    const now = Date.now();
    const next = reminders.map((reminder) =>
      reminder.id === reminderId
        ? {
            ...reminder,
            dueDate,
            time,
            completedAt: null,
            rescheduledAt: now,
            updatedAt: now,
          }
        : reminder,
    );
    await persistReminders(next);
  });
}

export function setReminderNotificationTiming(
  reminderId: string,
  notificationTiming: ReminderNotificationTiming,
): Promise<void> {
  return mutate(async () => {
    const reminders = await readReminders();
    const now = Date.now();
    const next = reminders.map((reminder) =>
      reminder.id === reminderId
        ? { ...reminder, notificationTiming, updatedAt: now }
        : reminder,
    );
    await persistReminders(next);
  });
}

export function removeReminder(reminderId: string): Promise<void> {
  return mutate(async () => {
    const reminders = await readReminders();
    await persistReminders(reminders.filter((reminder) => reminder.id !== reminderId));
  });
}

export function newReminderId(): string {
  return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createReminder(input: NewHealthReminderInput): Promise<HealthReminder> {
  return mutate(async () => {
    const reminders = await readReminders();
    const now = Date.now();
    const reminder: HealthReminder = {
      id: newReminderId(),
      petId: input.petId,
      petName: input.petName,
      recordId: null,
      title: input.title.trim(),
      type: input.type,
      description: input.description?.trim() ?? '',
      dueDate: input.dueDate,
      time: input.time,
      notificationTiming: input.notificationTiming,
      clinicId: null,
      clinicName: input.clinicName.trim() || defaultClinicName,
      completedAt: null,
      rescheduledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await persistReminders([...reminders, reminder]);
    return reminder;
  });
}