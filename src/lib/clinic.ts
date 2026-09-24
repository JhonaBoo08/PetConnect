import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { getSessionSync, isLocalTesting, LOCAL_TEST_VET_ID, useSession } from "@/lib/session";
import {
    clinicBridgeAvailable,
    fetchRemoteClinicProfile,
    submitClinicProfile,
} from "@/services/clinic";

export type VerificationStatus = "verified" | "pending" | "rejected";

export type ClinicProfile = {
  clinicId: string;
  userId: string;
  clinicName: string;
  email: string;
  phone: string;
  city: string;
  province: string;
  address: string;
  veterinarianInCharge: string;
  license: string;
  staff: string[];
  verificationStatus: VerificationStatus;
};

export type ClinicPreferences = {
  accessRequestAlerts: boolean;
  recordAlerts: boolean;
};

export type ClinicFeedback = {
  id: string;
  clinicId: string;
  clinicName: string;
  type: string;
  message: string;
  createdAt: number;
};

const PROFILES_KEY = "petconnect.clinicProfiles.v1";
const PREFS_KEY = "petconnect.clinicPreferences.v1";
const FEEDBACK_KEY = "petconnect.clinicFeedback.v1";

export const defaultClinicPreferences: ClinicPreferences = {
  accessRequestAlerts: true,
  recordAlerts: true,
};

export const feedbackTypes = [
  "Bug",
  "Suggestion",
  "Scanner issue",
  "Health record issue",
  "Other",
];

let profilesCache: ClinicProfile[] | null = null;
let prefsCache: Record<string, ClinicPreferences> = {};
let feedbackCache: ClinicFeedback[] | null = null;
let ready = false;
let loadPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();
const prefListeners = new Set<() => void>();
const feedbackListeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach((listener) => listener());
  prefListeners.forEach((listener) => listener());
  feedbackListeners.forEach((listener) => listener());
}

async function persist() {
  try {
    await AsyncStorage.multiSet([
      [PROFILES_KEY, JSON.stringify(profilesCache ?? [])],
      [PREFS_KEY, JSON.stringify(prefsCache)],
      [FEEDBACK_KEY, JSON.stringify(feedbackCache ?? [])],
    ]);
  } catch {
    // Storage is best-effort; the in-memory cache still works for this session.
  }
  notifyAll();
}

async function load(): Promise<void> {
  try {
    const entries = await AsyncStorage.multiGet([
      PROFILES_KEY,
      PREFS_KEY,
      FEEDBACK_KEY,
    ]);
    const values = new Map(entries);

    const rawProfiles = values.get(PROFILES_KEY);
    if (rawProfiles) {
      try {
        const parsed = JSON.parse(rawProfiles) as ClinicProfile[];
        if (Array.isArray(parsed)) profilesCache = parsed;
      } catch {
        // Ignore corrupt data and fall through to defaults.
      }
    }
    if (!profilesCache) profilesCache = [];
    if (
      isLocalTesting &&
      !profilesCache.some((profile) => profile.userId === LOCAL_TEST_VET_ID)
    ) {
      profilesCache.push({
        clinicId: "local-test-clinic",
        userId: LOCAL_TEST_VET_ID,
        clinicName: "Local Test Vet Clinic",
        email: "vet.test@petconnect.local",
        phone: "+63 917 000 0000",
        city: "Tagum City",
        province: "Davao del Norte",
        address: "Local emulator clinic",
        veterinarianInCharge: "Dr. Test User",
        license: "TEST-0001",
        staff: ["Dr. Test User"],
        verificationStatus: "verified",
      });
    }

    const rawPrefs = values.get(PREFS_KEY);
    if (rawPrefs) {
      try {
        prefsCache = JSON.parse(rawPrefs) as Record<string, ClinicPreferences>;
      } catch {
        // Ignore corrupt data and fall through to defaults.
      }
    }
    if (typeof prefsCache !== "object" || prefsCache === null) prefsCache = {};

    const rawFeedback = values.get(FEEDBACK_KEY);
    if (rawFeedback) {
      try {
        const parsed = JSON.parse(rawFeedback) as ClinicFeedback[];
        if (Array.isArray(parsed)) feedbackCache = parsed;
      } catch {
        // Ignore corrupt data and fall through to defaults.
      }
    }
    if (!feedbackCache) feedbackCache = [];

    void syncRemoteStatus();
    await persist();
  } finally {
    ready = true;
    notifyAll();
  }
}

/** Best-effort sync of the signed-in clinic's verification status from the backend. */
async function syncRemoteStatus(): Promise<void> {
  try {
    if (!(await clinicBridgeAvailable())) return;
    const remote = await fetchRemoteClinicProfile();
    if (!remote || !profilesCache) return;
    const userId = getSessionSync().user?.userId;
    if (!userId) return;
    const local = profilesCache.find((profile) => profile.userId === userId);
    if (!local) return;
    const updated: ClinicProfile = {
      ...local,
      clinicId: remote.clinicId,
      clinicName: remote.clinicName?.trim() || local.clinicName,
      verificationStatus: remote.status,
    };
    profilesCache = profilesCache.map((profile) =>
      profile.userId === userId ? updated : profile,
    );
    await persist();
  } catch {
    // Offline or unreachable backend; local state remains authoritative.
  }
}

/** Best-effort push of clinic details to the backend so it is queued for review. */
async function pushToBackend(profile: ClinicProfile): Promise<void> {
  try {
    if (!(await clinicBridgeAvailable())) return;
    const result = await submitClinicProfile({
      clinicName: profile.clinicName,
      phone: profile.phone,
      city: profile.city,
      province: profile.province,
      address: profile.address,
      veterinarianInCharge: profile.veterinarianInCharge,
      license: profile.license,
      staff: profile.staff,
    });
    profilesCache = (profilesCache ?? []).map((item) =>
      item.userId === profile.userId
        ? {
            ...item,
            clinicId: result.clinicId,
            clinicName: result.clinicName || item.clinicName,
            verificationStatus: result.status,
          }
        : item,
    );
    await persist();
  } catch {
    // Local-only registration when the backend is unreachable.
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

export function newClinicId(): string {
  return `clinic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getClinicProfilesSync(): ClinicProfile[] {
  return profilesCache ?? [];
}

export function getClinicProfileSync(
  userId?: string | null,
): ClinicProfile | null {
  const id = userId ?? getSessionSync().user?.userId ?? null;
  if (!id) return null;
  return (profilesCache ?? []).find((profile) => profile.userId === id) ?? null;
}

export async function getClinicProfileForUserId(
  userId: string,
): Promise<ClinicProfile | null> {
  if (profilesCache) return getClinicProfileSync(userId);
  await ensureLoaded();
  return getClinicProfileSync(userId);
}

export function reloadClinic(): Promise<void> {
  profilesCache = null;
  feedbackCache = null;
  ready = false;
  loadPromise = null;
  return ensureLoaded();
}

export function useClinicProfiles(): {
  profiles: ClinicProfile[];
  ready: boolean;
} {
  const [state, setState] = useState(() => ({
    profiles: getClinicProfilesSync(),
    ready,
  }));
  const session = useSession();

  useEffect(() => {
    let active = true;
    ensureLoaded().then(() => {
      if (active) setState({ profiles: getClinicProfilesSync(), ready });
    });
    function update() {
      if (active) setState({ profiles: getClinicProfilesSync(), ready });
    }
    listeners.add(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, [session.user?.userId]);

  return state;
}

export function useClinicProfile(): ClinicProfile | null {
  const { profiles, ready } = useClinicProfiles();
  const session = useSession();
  const userId = session.user?.userId;
  if (!userId || !ready) return null;
  return profiles.find((profile) => profile.userId === userId) ?? null;
}

/**
 * Verification gate for clinic workspace screens. Redirects a signed-in clinic
 * user to the verification screen whenever their profile is missing or not yet
 * verified. Screens in the workspace call this at the top of their component.
 */
export function useClinicGate(): void {
  const router = useRouter();
  const session = useSession();
  const { ready } = useClinicProfiles();
  const clinic = useClinicProfile();
  const evaluated = session.ready && ready;

  useEffect(() => {
    if (!evaluated || session.user?.accountType !== "vet") return;
    if (clinic && clinic.verificationStatus === "verified") return;
    router.replace("/clinic-verification");
  }, [evaluated, session.user?.accountType, clinic, router]);
}

export type ClinicDetailsInput = {
  phone: string;
  city: string;
  province: string;
  address: string;
  veterinarianInCharge: string;
  license: string;
  staff?: string[];
};

async function currentClinicProfile(): Promise<{
  profile: ClinicProfile | null;
  userId: string;
}> {
  await ensureLoaded();
  const userId = getSessionSync().user?.userId;
  if (!userId) {
    throw new Error("You must be signed in to do this.");
  }
  return { profile: getClinicProfileSync(userId), userId };
}

/** Persist clinic details for a newly registered vet clinic (marking it pending). */
export function registerClinicDetails(
  input: ClinicDetailsInput,
): Promise<ClinicProfile> {
  return mutate(async () => {
    const { profile, userId } = await currentClinicProfile();
    const user = getSessionSync().user;
    const existing: ClinicProfile = profile ?? {
      clinicId: newClinicId(),
      userId,
      clinicName: user?.fullName?.trim() || "My Clinic",
      email: user?.email ?? "",
      phone: "",
      city: "",
      province: "",
      address: "",
      veterinarianInCharge: "",
      license: "",
      staff: [],
      verificationStatus: "pending",
    };
    const updated: ClinicProfile = {
      ...existing,
      clinicName: existing.clinicName,
      phone: input.phone.trim() || existing.phone,
      city: input.city.trim() || existing.city,
      province: input.province.trim() || existing.province,
      address: input.address.trim() || existing.address,
      veterinarianInCharge:
        input.veterinarianInCharge.trim() || existing.veterinarianInCharge,
      license: input.license.trim() || existing.license,
      staff: input.staff ?? existing.staff,
      verificationStatus:
        existing.verificationStatus === "verified" ? "verified" : "pending",
    };
    profilesCache = [
      ...(profilesCache ?? []).filter(
        (item) => item.clinicId !== updated.clinicId,
      ),
      updated,
    ];
    await persist();
    await pushToBackend(updated);
    return updated;
  });
}

export function updateClinicInfo(
  input: ClinicDetailsInput,
): Promise<ClinicProfile> {
  return mutate(async () => {
    const { profile } = await currentClinicProfile();
    if (!profile) throw new Error("Clinic profile not found.");
    const updated: ClinicProfile = {
      ...profile,
      phone: input.phone.trim(),
      city: input.city.trim(),
      province: input.province.trim(),
      address: input.address.trim(),
      veterinarianInCharge: input.veterinarianInCharge.trim(),
      license: input.license.trim(),
    };
    profilesCache = (profilesCache ?? []).map((item) =>
      item.clinicId === updated.clinicId ? updated : item,
    );
    await persist();
    await pushToBackend(updated);
    return updated;
  });
}

export function updateClinicStaff(staff: string[]): Promise<ClinicProfile> {
  return mutate(async () => {
    const { profile } = await currentClinicProfile();
    if (!profile) throw new Error("Clinic profile not found.");
    const updated: ClinicProfile = { ...profile, staff };
    profilesCache = (profilesCache ?? []).map((item) =>
      item.clinicId === updated.clinicId ? updated : item,
    );
    await persist();
    return updated;
  });
}

export function getClinicPreferencesSync(
  clinicId?: string | null,
): ClinicPreferences {
  const id = clinicId ?? getClinicProfileSync()?.clinicId ?? null;
  if (!id) return { ...defaultClinicPreferences };
  return { ...defaultClinicPreferences, ...(prefsCache[id] ?? {}) };
}

export function useClinicPreferences(
  clinicId?: string | null,
): ClinicPreferences {
  const [prefs, setPrefs] = useState(() => getClinicPreferencesSync(clinicId));
  const profile = useClinicProfile();

  useEffect(() => {
    let active = true;
    ensureLoaded().then(() => {
      if (active)
        setPrefs(getClinicPreferencesSync(clinicId ?? profile?.clinicId));
    });
    function update() {
      if (active)
        setPrefs(getClinicPreferencesSync(clinicId ?? profile?.clinicId));
    }
    prefListeners.add(update);
    return () => {
      active = false;
      prefListeners.delete(update);
    };
  }, [clinicId, profile?.clinicId]);

  return prefs;
}

export function updateClinicPreferences(
  changes: Partial<ClinicPreferences>,
): Promise<ClinicPreferences> {
  return mutate(async () => {
    const { profile } = await currentClinicProfile();
    if (!profile) throw new Error("Clinic profile not found.");
    const current = prefsCache[profile.clinicId] ?? {
      ...defaultClinicPreferences,
    };
    prefsCache[profile.clinicId] = { ...current, ...changes };
    await persist();
    return prefsCache[profile.clinicId];
  });
}

export function submitClinicFeedback(input: {
  type: string;
  message: string;
}): Promise<ClinicFeedback> {
  return mutate(async () => {
    const profile = getClinicProfileSync();
    const feedback: ClinicFeedback = {
      id: `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      clinicId: profile?.clinicId ?? "unknown",
      clinicName: profile?.clinicName ?? "",
      type: input.type,
      message: input.message.trim(),
      createdAt: Date.now(),
    };
    feedbackCache = [...(feedbackCache ?? []), feedback];
    await persist();
    return feedback;
  });
}
