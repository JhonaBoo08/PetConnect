export type UserRole = "OWNER" | "CLINIC";
export type AccountStatus = "PENDING" | "ACTIVE" | "DISABLED";

export interface SessionResponse {
  role: UserRole;
  status: AccountStatus;
  clinicId?: string;
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
  sharePhoneWithClinics: boolean;
}

export interface UpdatePrivacySettings {
  shareRecoveryPhone?: boolean;
  sharePreciseRecoveryLocation?: boolean;
  sharePhoneWithClinics?: boolean;
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

export interface FinderSightingInput extends Coordinates {
  finderName?: string;
  finderContact?: string;
  notes?: string;
}

export interface Sighting extends Coordinates {
  id: string;
  reportId: string;
  finderName: string | null;
  finderContact: string | null;
  notes: string;
  createdAt: string;
}

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

export interface HealthRecordInput {
  recordType: HealthRecordType;
  title: string;
  notes?: string;
  occurredAt?: string;
}

export interface VaccinationInput {
  vaccineName: string;
  doseNumber?: string;
  lotNumber?: string;
  notes?: string;
  administeredAt?: string;
  nextDueAt?: string;
  notifyAt?: string;
}

export type ReminderStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type ReminderSource = "MANUAL" | "VACCINATION" | "APPOINTMENT";

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

export interface ClinicAppointmentInput {
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

export interface ClinicAppointmentUpdate {
  status?: AppointmentStatus;
  appointmentDate?: string;
  reason?: string;
  reminderMinutesBefore?: number;
}

export interface ClinicPatient {
  pet: Pet;
  owner: {
    displayName: string;
    phone: string | null;
  };
  clinicalHistoryGranted: boolean;
  clinicalAccessGranted: boolean;
  recentHealthRecords: HealthRecord[];
  upcomingAppointments: Appointment[];
}

export interface PublicRecoveryProfile {
  pet: {
    name: string;
    species: string;
    breed: string;
    sex: "Male" | "Female" | "";
    ageLabel: string;
    identifyingDetails: string;
    photoUrl: string | null;
  };
  owner: {
    displayName: string;
    phone: string | null;
  };
  activeReport: PublicActiveReport | null;
}
