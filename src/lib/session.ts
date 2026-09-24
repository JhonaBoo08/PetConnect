import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export type AccountType = "owner" | "vet";

export type UserProfile = {
  userId: string;
  fullName: string;
  email: string;
  accountType: AccountType;
  city: string;
  province: string;
  phoneNumber: string;
  profilePhoto: string;
};

export type EmergencyContact = {
  name: string;
  mobile: string;
  relationship: string;
  secondaryName: string;
  secondaryMobile: string;
  secondaryRelationship: string;
};

export type Preferences = {
  healthReminders: boolean;
  lostPetAlerts: boolean;
  nearbyRecoveryAlerts: boolean;
  clinicUpdates: boolean;
  showRecoveryContact: boolean;
  nearbyVisibility: boolean;
};

export type AuthAccount = {
  userId: string;
  email: string;
  password: string;
};

const SESSION_KEY = "petconnect.session.v1";
const ACCOUNTS_KEY = "petconnect.accounts.v1";
const PROFILES_KEY = "petconnect.profiles.v1";
const EMERGENCY_KEY = "petconnect.emergency.v1";
const PREFS_KEY = "petconnect.preferences.v1";

const defaultPreferences: Preferences = {
  healthReminders: true,
  lostPetAlerts: true,
  nearbyRecoveryAlerts: true,
  clinicUpdates: true,
  showRecoveryContact: true,
  nearbyVisibility: true,
};

let sessionUserId: string | null = null;
let accounts: Record<string, AuthAccount> = {};
let profiles: Record<string, UserProfile> = {};
let emergency: Record<string, EmergencyContact> = {};
let preferences: Record<string, Preferences> = {};
let ready = false;
let loadPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function persistAll() {
  try {
    await AsyncStorage.multiSet([
      [ACCOUNTS_KEY, JSON.stringify(accounts)],
      [PROFILES_KEY, JSON.stringify(profiles)],
      [EMERGENCY_KEY, JSON.stringify(emergency)],
      [PREFS_KEY, JSON.stringify(preferences)],
      [SESSION_KEY, JSON.stringify({ userId: sessionUserId })],
    ]);
  } catch {
    // Storage is best-effort; the in-memory cache still works for this session.
  }
}

async function load(): Promise<void> {
  try {
    const entries = await AsyncStorage.multiGet([
      ACCOUNTS_KEY,
      PROFILES_KEY,
      EMERGENCY_KEY,
      PREFS_KEY,
      SESSION_KEY,
    ]);
    const values = new Map(entries);
    const rawAccounts = values.get(ACCOUNTS_KEY);
    const rawProfiles = values.get(PROFILES_KEY);
    const rawEmergency = values.get(EMERGENCY_KEY);
    const rawPrefs = values.get(PREFS_KEY);
    const rawSession = values.get(SESSION_KEY);

    if (rawAccounts) {
      try {
        accounts = JSON.parse(rawAccounts) as Record<string, AuthAccount>;
      } catch {
        // Ignore corrupt data and fall through to defaults.
      }
    }
    if (rawProfiles) {
      try {
        profiles = JSON.parse(rawProfiles) as Record<string, UserProfile>;
      } catch {
        // Ignore corrupt data and fall through to defaults.
      }
    }
    if (rawEmergency) {
      try {
        emergency = JSON.parse(rawEmergency) as Record<
          string,
          EmergencyContact
        >;
      } catch {
        // Ignore corrupt data and fall through to defaults.
      }
    }
    if (rawPrefs) {
      try {
        preferences = JSON.parse(rawPrefs) as Record<string, Preferences>;
      } catch {
        // Ignore corrupt data and fall through to defaults.
      }
    }
    if (rawSession) {
      try {
        sessionUserId =
          (JSON.parse(rawSession) as { userId: string | null }).userId ?? null;
      } catch {
        sessionUserId = null;
      }
    }

    delete accounts["raven@petconnect.ph"];
    delete accounts["clinic@petconnect.ph"];
    delete profiles["demo-owner"];
    delete profiles["demo-clinic"];
    delete emergency["demo-owner"];
    delete preferences["demo-owner"];
    delete preferences["demo-clinic"];
    if (sessionUserId === "demo-owner" || sessionUserId === "demo-clinic") {
      sessionUserId = null;
    }

    ready = true;
    await persistAll();
  } finally {
    ready = true;
    notify();
  }
}

function ensureLoaded(): Promise<void> {
  if (ready) return Promise.resolve();
  loadPromise ??= load();
  return loadPromise;
}

export function ensureSessionLoaded(): Promise<void> {
  return ensureLoaded();
}

export type SessionState = {
  ready: boolean;
  userId: string | null;
  user: UserProfile | null;
  emergencyContact: EmergencyContact | null;
  preferences: Preferences | null;
};

export function getSessionSync(): SessionState {
  const user =
    sessionUserId && profiles[sessionUserId] ? profiles[sessionUserId] : null;
  const userId = user ? user.userId : null;
  return {
    ready,
    userId,
    user,
    emergencyContact: userId ? (emergency[userId] ?? null) : null,
    preferences: userId
      ? (preferences[userId] ?? { ...defaultPreferences })
      : null,
  };
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(getSessionSync());

  useEffect(() => {
    let active = true;
    ensureLoaded().then(() => {
      if (active) setState(getSessionSync());
    });
    function update() {
      if (active) setState(getSessionSync());
    }
    listeners.add(update);
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  return state;
}

function currentUserId(): string {
  if (sessionUserId && profiles[sessionUserId]) return sessionUserId;
  throw new Error("You must be signed in to do this.");
}

export async function signIn(
  email: string,
  password: string,
): Promise<UserProfile> {
  await ensureLoaded();
  const key = email.trim().toLowerCase();
  const account = accounts[key];
  if (!account) {
    throw new Error("No account found for this email address.");
  }
  if (account.password !== password) {
    throw new Error("Incorrect password. Please try again.");
  }
  sessionUserId = account.userId;
  await persistAll();
  notify();
  const user = profiles[account.userId];
  if (!user) {
    throw new Error("Unable to load your profile. Please sign in again.");
  }
  return user;
}

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  accountType: AccountType;
}): Promise<UserProfile> {
  await ensureLoaded();
  const email = input.email.trim();
  const key = email.toLowerCase();
  if (accounts[key]) {
    throw new Error("An account with this email already exists.");
  }
  if (!input.fullName.trim()) {
    throw new Error("Please enter your name.");
  }
  const userId = `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  accounts[key] = { userId, email, password: input.password };
  profiles[userId] = {
    userId,
    fullName: input.fullName.trim(),
    email,
    accountType: input.accountType,
    city: "",
    province: "",
    phoneNumber: "",
    profilePhoto: "",
  };
  preferences[userId] = { ...defaultPreferences };
  sessionUserId = userId;
  await persistAll();
  notify();
  return profiles[userId];
}

export type OwnerDetailsInput = {
  phoneNumber: string;
  city: string;
  province: string;
  contactName: string;
  contactMobile: string;
  relationship: string;
  secondaryName: string;
  secondaryMobile: string;
  secondaryRelationship: string;
};

export async function completeOwnerDetails(
  input: OwnerDetailsInput,
): Promise<UserProfile> {
  await ensureLoaded();
  const userId = currentUserId();
  const profile = profiles[userId];
  profiles[userId] = {
    ...profile,
    phoneNumber: input.phoneNumber.trim(),
    city: input.city.trim(),
    province: input.province.trim(),
  };
  emergency[userId] = {
    name: input.contactName.trim(),
    mobile: input.contactMobile.trim(),
    relationship: input.relationship.trim(),
    secondaryName: input.secondaryName.trim(),
    secondaryMobile: input.secondaryMobile.trim(),
    secondaryRelationship: input.secondaryRelationship.trim(),
  };
  await persistAll();
  notify();
  return profiles[userId];
}

export async function updateEmergencyContact(
  contact: Omit<
    EmergencyContact,
    "secondaryName" | "secondaryMobile" | "secondaryRelationship"
  > & {
    secondaryName?: string;
    secondaryMobile?: string;
    secondaryRelationship?: string;
  },
): Promise<EmergencyContact> {
  await ensureLoaded();
  const userId = currentUserId();
  emergency[userId] = {
    name: contact.name.trim(),
    mobile: contact.mobile.trim(),
    relationship: contact.relationship.trim(),
    secondaryName: contact.secondaryName?.trim() ?? "",
    secondaryMobile: contact.secondaryMobile?.trim() ?? "",
    secondaryRelationship: contact.secondaryRelationship?.trim() ?? "",
  };
  await persistAll();
  notify();
  return emergency[userId];
}

export async function updatePreferences(
  changes: Partial<Preferences>,
): Promise<Preferences> {
  await ensureLoaded();
  const userId = currentUserId();
  const current = preferences[userId] ?? { ...defaultPreferences };
  preferences[userId] = { ...current, ...changes };
  await persistAll();
  notify();
  return preferences[userId];
}

export async function logout(): Promise<void> {
  await ensureLoaded();
  sessionUserId = null;
  try {
    await AsyncStorage.multiRemove([SESSION_KEY]);
  } catch {
    // Best-effort persistence.
  }
  notify();
}

export function roleLabel(accountType: AccountType): string {
  return accountType === "vet" ? "Vet Clinic" : "Pet Owner";
}

export function getPreferencesFor(userId: string): Preferences {
  return preferences[userId] ?? { ...defaultPreferences };
}

export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const prefix = `${parts[0]} ${parts[1]}`;
    const rest = trimmed.slice(prefix.length).trim();
    const digits = rest.replace(/\D/g, "");
    const tail = digits.slice(-2);
    return `${prefix} ··· ${tail ? `··${tail}` : "···"}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return "···";
  return `${trimmed.slice(0, 6)} ··· ··${digits.slice(-2)}`;
}
