import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type HealthRecordType = 'Vaccination' | 'Checkup' | 'Medication' | 'Other';

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
  createdAt: number;
  updatedAt: number;
};

export type NewHealthRecordInput = Omit<
  HealthRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export type HealthReminder = {
  id: string;
  petId: string;
  petName: string;
  recordId: string | null;
  title: string;
  dueDate: string;
  time: string;
  createdAt: number;
  updatedAt: number;
};

const RECORDS_KEY = 'petconnect.healthRecords.v1';
const REMINDERS_KEY = 'petconnect.healthReminders.v1';

export const recordTypes: HealthRecordType[] = [
  'Vaccination',
  'Checkup',
  'Medication',
  'Other',
];

export const reminderTimes = ['9:30 AM', '10:00 AM', '2:00 PM'];

export const seedHealthRecords: HealthRecord[] = [
  {
    id: 'five-in-one',
    petId: 'PC-TAG-10482',
    petName: 'Bantay',
    recordType: 'Vaccination',
    recordName: '5-in-1 Vaccine',
    recordDate: '2026-09-20',
    veterinaryClinic: 'Tagum Pet Care Clinic',
    notes: 'Second dose of the 5-in-1 vaccine. Bantay tolerated the shot well.',
    nextDueDate: '2027-09-20',
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'anti-rabies',
    petId: 'PC-TAG-10482',
    petName: 'Bantay',
    recordType: 'Vaccination',
    recordName: 'Anti-Rabies',
    recordDate: '2026-08-14',
    veterinaryClinic: 'Tagum Pet Care Clinic',
    notes: 'First rabies vaccination. No adverse reactions were observed after administration.',
    nextDueDate: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'annual-checkup',
    petId: 'PC-TAG-10482',
    petName: 'Bantay',
    recordType: 'Checkup',
    recordName: 'Annual Checkup',
    recordDate: '2026-06-03',
    veterinaryClinic: 'Tagum Pet Care Clinic',
    notes: 'Healthy weight · 26.4 kg',
    nextDueDate: null,
    createdAt: 0,
    updatedAt: 0,
  },
];

export const seedHealthReminders: HealthReminder[] = [
  {
    id: 'rem-fvrcp',
    petId: 'PC-TAG-10483',
    petName: 'Mingming',
    recordId: null,
    title: 'FVRCP booster',
    dueDate: '2026-09-20',
    time: '9:30 AM',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'rem-evrcp',
    petId: 'PC-TAG-10482',
    petName: 'Bantay',
    recordId: null,
    title: 'EVRCP booster',
    dueDate: '2026-10-05',
    time: '2:00 PM',
    createdAt: 0,
    updatedAt: 0,
  },
];

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
        recordsCache = parsed;
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
        remindersCache = parsed;
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

export function newRecordId(): string {
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertRecordReminder(record: HealthRecord) {
  if (!record.nextDueDate) return;
  const id = `rem-${record.id}`;
  const existing =
    remindersCache?.find((reminder) => reminder.id === id) ?? null;
  const reminder: HealthReminder = {
    id,
    petId: record.petId,
    petName: record.petName,
    recordId: record.id,
    title: record.recordName,
    dueDate: record.nextDueDate,
    time: existing?.time ?? reminderTimes[0],
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  const next = [
    ...(remindersCache ?? []).filter((item) => item.id !== id),
    reminder,
  ];
  void persistReminders(next);
}

function removeRecordReminder(recordId: string) {
  const next = (remindersCache ?? []).filter(
    (reminder) => reminder.id !== `rem-${recordId}` && reminder.recordId !== recordId,
  );
  void persistReminders(next);
}

export async function createHealthRecord(input: NewHealthRecordInput): Promise<HealthRecord> {
  const records = await readRecords();
  const now = Date.now();
  const record: HealthRecord = {
    ...input,
    id: newRecordId(),
    createdAt: now,
    updatedAt: now,
  };
  await persistRecords([...records, record]);
  if (record.nextDueDate) upsertRecordReminder(record);
  return record;
}

export async function updateHealthRecord(
  id: string,
  input: NewHealthRecordInput,
): Promise<HealthRecord> {
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
    upsertRecordReminder(updated);
  } else {
    removeRecordReminder(id);
  }
  return updated;
}

export async function deleteHealthRecord(id: string): Promise<void> {
  const records = await readRecords();
  await persistRecords(records.filter((record) => record.id !== id));
  removeRecordReminder(id);
}