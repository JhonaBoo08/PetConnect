export type UserRole = "OWNER";
export type AccountStatus = "PENDING" | "ACTIVE" | "DISABLED";

export interface SessionResponse {
  role: UserRole;
  status: AccountStatus;
  displayName: string;
  email: string;
  phone?: string;
}

export interface InitializeOwnerRequest {
  displayName: string;
  phone?: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  phone?: string;
}

export interface PrivacySettings {
  shareRecoveryPhone: boolean;
  sharePreciseRecoveryLocation: boolean;
}

export interface UpdatePrivacySettings {
  shareRecoveryPhone?: boolean;
  sharePreciseRecoveryLocation?: boolean;
}

export interface UploadResponse {
  url: string;
}

export interface PetInput {
  name: string;
  species: string;
  breed: string;
  sex: "Male" | "Female" | "";
  ageLabel: string;
  identifyingDetails: string;
  microchipNumber: string;
}

export interface Pet extends PetInput {
  id: string;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryTokenState {
  active: boolean;
  token: string | null;
  recoveryUrl: string | null;
}

export type RecoveryTagStatus = "ACTIVE" | "LOST" | "REVOKED";
export type RecoveryTagType =
  "PRINT" | "COLLAR" | "HARNESS" | "STICKER" | "OTHER";

export interface RecoveryTag {
  id: string;
  petId: string;
  label: string;
  tagType: RecoveryTagType;
  status: RecoveryTagStatus;
  shortCode: string;
  token: string | null;
  recoveryUrl: string | null;
  lastScannedAt: string | null;
  scanCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryTagScan {
  id: string;
  tagId: string;
  petId: string;
  label: string;
  shortCode: string;
  source: "QR" | "CODE";
  createdAt: string;
}

export interface RecoveryTimelineEvent {
  id: string;
  kind: "REPORTED_LOST" | "TAG_SCANNED" | "SIGHTING" | "FOUND" | "REUNITED";
  title: string;
  detail: string;
  createdAt: string;
  sightingId?: string;
  tagId?: string;
}

export type RecoveryStatus = "LOST" | "SIGHTED" | "REUNITED";

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
}

export interface LostReportInput extends Coordinates {
  petId: string;
  lastSeenText: string;
  details?: string;
}

export interface LostReport {
  id: string;
  petId: string;
  petName: string;
  petSpecies: string;
  petBreed: string;
  petPhotoUrl: string | null;
  status: RecoveryStatus;
  lastSeenText: string;
  details: string;
  lastSeenLatitude: number;
  lastSeenLongitude: number;
  lastKnownLatitude: number;
  lastKnownLongitude: number;
  lastKnownAccuracyM: number | null;
  reportedAt: string;
  lastSightedAt: string | null;
  reunitedAt: string | null;
  sightingCount: number;
}

export interface NearbyLostReport {
  id: string;
  petName: string;
  petSpecies: string;
  petBreed: string;
  petPhotoUrl: string | null;
  status: Exclude<RecoveryStatus, "REUNITED">;
  lastSeenText: string;
  details: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  reportedAt: string;
  lastSightedAt: string | null;
  distanceKm: number;
  sightingCount: number;
  matchReasons: string[];
}

export interface PublicActiveReport {
  status: Exclude<RecoveryStatus, "REUNITED">;
  lastSeenText: string;
  details: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  reportedAt: string;
  lastSightedAt: string | null;
  sightingCount: number;
}

export type FinderEncounterType = "SEEN" | "HAVE_PET";
export type FinderRiskState = "ACCEPTED" | "REVIEW" | "BLOCKED";
export type FinderLocationSource = "GPS" | "MAP" | "TEXT" | "NONE" | "LEGACY";

export interface FinderSessionPublicState {
  credential: string;
  expiresAt: string;
  phoneVerified: boolean;
  verificationRequired: boolean;
}

export interface SightingEvidence {
  id: string;
  url: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  sha256?: string;
  createdAt: string;
}

export interface FinderSightingInput {
  encounterType?: FinderEncounterType;
  evidenceId?: string;
  finderName?: string;
  finderContact?: string;
  shareContact?: boolean;
  notes?: string;
  locationText?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  locationSource?: Exclude<FinderLocationSource, "LEGACY">;
  idempotencyKey?: string;
}

export interface Sighting {
  id: string;
  reportId: string;
  encounterType: FinderEncounterType;
  finderName: string | null;
  finderContact: string | null;
  contactShared: boolean;
  phoneVerified: boolean;
  notes: string;
  locationText: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  locationSource: FinderLocationSource;
  riskState: FinderRiskState;
  evidence: SightingEvidence[];
  createdAt: string;
}

export interface RecoveryContactEvent {
  id: string;
  petName: string;
  encounterType: FinderEncounterType;
  finderName: string | null;
  finderContact: string | null;
  contactShared: boolean;
  phoneVerified: boolean;
  notes: string;
  locationText: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  locationSource: Exclude<FinderLocationSource, "LEGACY">;
  riskState: FinderRiskState;
  evidence: SightingEvidence[];
  createdAt: string;
}

export type FinderSubmissionResult =
  | { kind: "SIGHTING"; sighting: Sighting }
  | { kind: "RECOVERY_CONTACT"; event: RecoveryContactEvent };

export interface RecoveryNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface PushDeviceInput {
  expoPushToken: string;
  platform: "ios" | "android";
  latitude?: number;
  longitude?: number;
  accuracyM?: number | null;
}

export type HealthRecordType =
  "CHECKUP" | "VACCINATION" | "MEDICATION" | "LAB" | "PROCEDURE" | "OTHER";

export interface ClinicSummary {
  id: string;
  name: string;
  address: string;
  phone: string | null;
}

export interface HealthRecord {
  id: string;
  petId: string;
  petName: string;
  clinic: ClinicSummary;
  vetName: string;
  recordType: HealthRecordType;
  title: string;
  notes: string;
  occurredAt: string;
  vaccineName: string | null;
  doseNumber: string | null;
  lotNumber: string | null;
  nextDueAt: string | null;
  createdAt: string;
}

export type ReminderStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type ReminderSource = "MANUAL" | "VACCINATION" | "APPOINTMENT";

export interface CareCalendarRange {
  from: string;
  to: string;
}

export interface HealthReminderInput {
  petId: string;
  title: string;
  notes?: string;
  dueAt: string;
  notifyAt?: string;
}

export interface HealthReminderUpdate {
  title?: string;
  notes?: string;
  dueAt?: string;
  notifyAt?: string;
  status?: ReminderStatus;
}

export interface HealthReminder {
  id: string;
  petId: string;
  petName: string;
  clinic: ClinicSummary | null;
  sourceType: ReminderSource;
  sourceId: string | null;
  title: string;
  notes: string;
  dueAt: string;
  notifyAt: string;
  status: ReminderStatus;
  completedAt: string | null;
  createdAt: string;
}

export type AppointmentStatus =
  "REQUESTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";

export interface AppointmentInput {
  petId: string;
  clinicId: string;
  appointmentDate: string;
  reason?: string;
  reminderMinutesBefore?: number;
}

export interface Appointment {
  id: string;
  petId: string;
  petName: string;
  petSpecies: string;
  petBreed: string;
  petPhotoUrl: string | null;
  clinic: ClinicSummary;
  ownerName: string;
  ownerPhone: string | null;
  vetName: string | null;
  appointmentDate: string;
  status: AppointmentStatus;
  reason: string;
  reminderMinutesBefore: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRecoveryProfile {
  pet: {
    name: string;
    species: string;
    breed: string;
    sex: "Male" | "Female" | "";
    ageLabel: string;
    identifyingDetails: string;
    microchipped: boolean;
    photoUrl: string | null;
  };
  owner: {
    displayName: string;
    phone: string | null;
  };
  activeReport: PublicActiveReport | null;
}
