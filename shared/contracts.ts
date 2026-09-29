export type UserRole = "OWNER" | "CLINIC";
export type AccountStatus = "PENDING" | "ACTIVE" | "DISABLED";

export interface SessionResponse {
  role: UserRole;
  status: AccountStatus;
  clinicId?: string;
}

export interface InitializeOwnerRequest {
  displayName: string;
  phone?: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  phone?: string;
}

export interface UploadResponse {
  url: string;
}
export interface PetInput {
  name: string;
  species: string;
  breed?: string;
  birthDate?: string;
  photoUrl?: string;
}

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  species: string;
  breed?: string;
  birthDate?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}
