# PetConnect Architecture Design: Node.js Express API + Firebase Auth + MySQL

## Overview

PetConnect uses a zero-cost, Spark-compatible architecture:
- **Firebase Authentication**: Identity management, email/password auth, JWT ID tokens, and custom claims (`OWNER`, `CLINIC`).
- **Shared Contracts (`shared/contracts.ts`)**: Defines shared request/response DTOs and interfaces used by both frontend and API.
- **Express API Server (`backend/api`)**: Self-hosted Node.js HTTP service. Validates Firebase ID tokens using `firebase-admin`, executes MySQL operations via `mysql2/promise`, serves `GET /v1/health`, public profile routes, and handles secure local uploads (`/uploads`).
- **MySQL Database**: Single schema `sql/schema.sql` (InnoDB, `utf8mb4_unicode_ci`) applied to `petconnect_db` (development) or `petconnect_test` (integration testing).

```
+-------------------------------------------------------------------+
|                     Expo React Native Frontend                     |
+-------------------------------------------------------------------+
        |                                      |
   1. Auth Flow                           2. API Requests
        v                                      v
+------------------+                  +------------------------+
|  Firebase Auth   |                  | Node.js Express API    |
|  (Spark Free)    |                  | (Bearer Token Auth)    |
+------------------+                  +------------------------+
                                           |             |
                                  3. Media Uploads   4. SQL Queries
                                           v             v
                                     +----------+  +--------------------+
                                     | /uploads |  | MySQL Server       |
                                     | (Local)  |  | (petconnect_db)    |
                                     +----------+  +--------------------+
```

## Shared Contracts (`shared/contracts.ts`)

```typescript
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
```

## Database Schema (`sql/schema.sql`)

```sql
CREATE DATABASE IF NOT EXISTS petconnect_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE petconnect_db;

-- 1. Users table (Primary key matches Firebase Auth UID)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('OWNER', 'CLINIC') NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NULL,
  status ENUM('PENDING', 'ACTIVE', 'DISABLED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Clinics table
CREATE TABLE IF NOT EXISTS clinics (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(30) NULL,
  status ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Clinic Members table
CREATE TABLE IF NOT EXISTS clinic_members (
  clinic_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clinic_id, user_id),
  KEY idx_member_user (user_id),
  CONSTRAINT fk_cm_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Pets table
CREATE TABLE IF NOT EXISTS pets (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  name VARCHAR(100) NOT NULL,
  species VARCHAR(50) NOT NULL,
  breed VARCHAR(100) NULL,
  birth_date DATE NULL,
  photo_url VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pets_owner (owner_id),
  CONSTRAINT fk_pets_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Health Records table
CREATE TABLE IF NOT EXISTS health_records (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  clinic_id VARCHAR(64) NOT NULL,
  vet_id VARCHAR(128) NOT NULL,
  record_type VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_pet (pet_id),
  KEY idx_hr_clinic (clinic_id),
  KEY idx_hr_vet (vet_id),
  CONSTRAINT fk_hr_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE RESTRICT,
  CONSTRAINT fk_hr_vet FOREIGN KEY (vet_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  clinic_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  vet_id VARCHAR(128) NULL,
  appointment_date DATETIME NOT NULL,
  status ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_pet (pet_id),
  KEY idx_app_clinic (clinic_id),
  KEY idx_app_owner (owner_id),
  KEY idx_app_vet (vet_id),
  CONSTRAINT fk_app_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  CONSTRAINT fk_app_clinic FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE RESTRICT,
  CONSTRAINT fk_app_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_app_vet FOREIGN KEY (vet_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(128) NOT NULL,
  details JSON NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_performed (performed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Environment & Configuration

- **API CORS Configuration**: `CORS_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081` in `backend/api/.env`.
- **Frontend Configuration**: `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000` (or `http://192.168.x.x:3000` for physical device testing).
- **Firebase Admin SDK Setup**:
  - Local/Testing: Initialized with `projectId: "demo-petconnect"` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
  - Production: Initialized via service account credentials (`GOOGLE_APPLICATION_CREDENTIALS`) outside Git.

## Data Migration Note

No existing production Firestore data exists. This is a clean setup into MySQL, so no data migration scripts are required.
