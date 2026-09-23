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
