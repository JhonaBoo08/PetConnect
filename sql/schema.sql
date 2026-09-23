-- Run this script against an existing petconnect_db or petconnect_test database.
-- Example: mysql -u root -p petconnect_db < sql/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('OWNER', 'CLINIC') NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NULL,
  status ENUM('PENDING', 'ACTIVE', 'DISABLED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  KEY users_role_status_index (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinics (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(30) NULL,
  status ENUM('PENDING', 'ACTIVE', 'DISABLED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY clinics_status_index (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_members (
  clinic_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clinic_id, user_id),
  KEY clinic_members_user_index (user_id),
  CONSTRAINT clinic_members_clinic_fk
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
  CONSTRAINT clinic_members_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY pets_owner_index (owner_id),
  CONSTRAINT pets_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS health_records (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  clinic_id VARCHAR(64) NOT NULL,
  vet_id VARCHAR(128) NOT NULL,
  record_type VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY health_records_pet_index (pet_id),
  KEY health_records_clinic_index (clinic_id),
  KEY health_records_vet_index (vet_id),
  CONSTRAINT health_records_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT health_records_clinic_fk
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT,
  CONSTRAINT health_records_vet_fk
    FOREIGN KEY (vet_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY appointments_pet_index (pet_id),
  KEY appointments_clinic_date_index (clinic_id, appointment_date),
  KEY appointments_owner_date_index (owner_id, appointment_date),
  KEY appointments_vet_index (vet_id),
  CONSTRAINT appointments_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT appointments_clinic_fk
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT,
  CONSTRAINT appointments_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT appointments_vet_fk
    FOREIGN KEY (vet_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(128) NOT NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY audit_logs_entity_index (entity_type, entity_id),
  KEY audit_logs_actor_index (performed_by),
  KEY audit_logs_created_at_index (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
