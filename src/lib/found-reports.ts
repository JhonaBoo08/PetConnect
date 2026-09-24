import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type FoundReportStatus = 'OPEN' | 'RESOLVED';

export type FoundReport = {
  id: string;
  alertId: string | null;
  petId: string;
  petName: string;
  ownerId: string;
  finderId: string;
  where: string;
  message: string;
  photo: string;
  status: FoundReportStatus;
  createdAt: number;
};

export type NewFoundReportInput = Omit<FoundReport, 'id' | 'createdAt'>;

const REPORTS_KEY = 'petconnect.foundReports.v1';

let reportsCache: FoundReport[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function persist(reports: FoundReport[]) {
  reportsCache = reports;
  try {
    await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  } catch {
    // Best-effort persistence.
  }
  notify();
}

async function readReports(): Promise<FoundReport[]> {
  if (reportsCache) return reportsCache;
  try {
    const raw = await AsyncStorage.getItem(REPORTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FoundReport[];
      if (Array.isArray(parsed)) {
        reportsCache = parsed.map(normalizeReport);
        await persist(reportsCache);
        return reportsCache;
      }
    }
  } catch {
    // Fall through to empty list.
  }
  reportsCache = [];
  await persist(reportsCache);
  return reportsCache;
}

function normalizeReport(report: FoundReport): FoundReport {
  return {
    ...report,
    alertId: report.alertId ?? null,
    ownerId: report.ownerId ?? '',
    finderId: report.finderId ?? '',
    status: report.status ?? 'OPEN',
  };
}

export async function getFoundReports(): Promise<FoundReport[]> {
  return readReports();
}

export function getFoundReportSync(id: string): FoundReport | null {
  return (reportsCache ?? []).find((r) => r.id === id) ?? null;
}

export async function getFoundReport(id: string): Promise<FoundReport | null> {
  return (await readReports()).find((r) => r.id === id) ?? null;
}

export async function createFoundReport(
  input: NewFoundReportInput,
): Promise<FoundReport> {
  const reports = await readReports();
  const report: FoundReport = {
    ...input,
    id: `frep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    alertId: input.alertId ?? null,
    status: input.status ?? 'OPEN',
    createdAt: Date.now(),
  };
  await persist([report, ...reports]);
  return report;
}

export function useFoundReports(): FoundReport[] {
  const [reports, setReports] = useState<FoundReport[]>(reportsCache ?? []);

  useEffect(() => {
    let active = true;
    readReports().then((loaded) => {
      if (active) setReports(loaded);
    });
    function update() {
      if (active) setReports(reportsCache ?? []);
    }
    listeners.add(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  return reports;
}