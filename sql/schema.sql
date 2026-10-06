CREATE TABLE IF NOT EXISTS media_cleanup_jobs (
  storage_url VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  not_before DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (storage_url),
  KEY media_cleanup_due_index (not_before)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Run this script against an existing petconnect_db or petconnect_test database.
-- Example: mysql -u root -p petconnect_db < sql/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('OWNER', 'CLINIC') NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NULL,
  share_recovery_phone TINYINT(1) NOT NULL DEFAULT 0,
  share_precise_recovery_location TINYINT(1) NOT NULL DEFAULT 0,
  share_phone_with_clinics TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('PENDING', 'ACTIVE', 'DISABLED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  KEY users_role_status_index (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filename)
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
  sex VARCHAR(10) NULL,
  age_label VARCHAR(50) NULL,
  identifying_details TEXT NULL,
  microchip_number VARCHAR(64) NULL,
  photo_url VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY pets_owner_index (owner_id),
  UNIQUE KEY pets_microchip_unique (microchip_number),
  CONSTRAINT pets_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pet_recovery_tokens (
  pet_id VARCHAR(64) NOT NULL,
  token_id CHAR(32) NOT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (pet_id),
  UNIQUE KEY pet_recovery_tokens_token_unique (token_id),
  CONSTRAINT pet_recovery_tokens_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lost_reports (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  status ENUM('LOST', 'SIGHTED', 'REUNITED') NOT NULL DEFAULT 'LOST',
  last_seen_text VARCHAR(255) NOT NULL,
  details TEXT NULL,
  last_seen_latitude DECIMAL(10,7) NOT NULL,
  last_seen_longitude DECIMAL(10,7) NOT NULL,
  last_seen_accuracy_m DECIMAL(10,2) NULL,
  last_known_latitude DECIMAL(10,7) NOT NULL,
  last_known_longitude DECIMAL(10,7) NOT NULL,
  last_known_accuracy_m DECIMAL(10,2) NULL,
  reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sighted_at TIMESTAMP NULL DEFAULT NULL,
  reunited_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  open_slot TINYINT GENERATED ALWAYS AS (
    CASE WHEN status IN ('LOST', 'SIGHTED') THEN 1 ELSE NULL END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY lost_reports_one_open_per_pet (pet_id, open_slot),
  KEY lost_reports_owner_status_index (owner_id, status),
  KEY lost_reports_status_index (status),
  KEY lost_reports_last_known_index (last_known_latitude, last_known_longitude),
  CONSTRAINT lost_reports_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT lost_reports_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finder_sessions (
  id VARCHAR(64) NOT NULL,
  secret_hash CHAR(64) NOT NULL,
  ip_hash CHAR(64) NULL,
  user_agent_family VARCHAR(80) NULL,
  status ENUM('ACTIVE', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  phone_verified_at TIMESTAMP NULL DEFAULT NULL,
  verified_phone_hash CHAR(64) NULL,
  submission_count INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY finder_sessions_secret_hash_unique (secret_hash),
  KEY finder_sessions_ip_created_index (ip_hash, created_at),
  KEY finder_sessions_expires_index (expires_at),
  KEY finder_sessions_phone_index (verified_phone_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finder_otp_challenges (
  id VARCHAR(64) NOT NULL,
  finder_session_id VARCHAR(64) NOT NULL,
  phone_hash CHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY finder_otp_session_created_index (finder_session_id, created_at),
  KEY finder_otp_phone_created_index (phone_hash, created_at),
  KEY finder_otp_expires_index (expires_at),
  CONSTRAINT finder_otp_session_fk
    FOREIGN KEY (finder_session_id) REFERENCES finder_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sightings (
  id VARCHAR(64) NOT NULL,
  report_id VARCHAR(64) NOT NULL,
  finder_user_id VARCHAR(128) NULL,
  finder_session_id VARCHAR(64) NULL,
  encounter_type ENUM('SEEN', 'HAVE_PET') NOT NULL DEFAULT 'SEEN',
  finder_name VARCHAR(80) NULL,
  finder_contact VARCHAR(120) NULL,
  notes TEXT NULL,
  location_text VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  accuracy_m DECIMAL(10,2) NULL,
  location_source ENUM('GPS', 'MAP', 'TEXT', 'NONE', 'LEGACY') NOT NULL DEFAULT 'LEGACY',
  contact_share_consent TINYINT(1) NOT NULL DEFAULT 0,
  phone_verified_snapshot TINYINT(1) NOT NULL DEFAULT 0,
  risk_state ENUM('ACCEPTED', 'REVIEW', 'BLOCKED') NOT NULL DEFAULT 'ACCEPTED',
  idempotency_key VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sightings_report_created_index (report_id, created_at),
  KEY sightings_finder_index (finder_user_id),
  KEY sightings_finder_session_index (finder_session_id, created_at),
  UNIQUE KEY sightings_session_idempotency_unique (finder_session_id, idempotency_key),
  CONSTRAINT sightings_report_fk
    FOREIGN KEY (report_id) REFERENCES lost_reports(id) ON DELETE CASCADE,
  CONSTRAINT sightings_finder_user_fk
    FOREIGN KEY (finder_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT sightings_finder_session_fk
    FOREIGN KEY (finder_session_id) REFERENCES finder_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recovery_contact_events (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  finder_session_id VARCHAR(64) NULL,
  encounter_type ENUM('SEEN', 'HAVE_PET') NOT NULL DEFAULT 'HAVE_PET',
  finder_name VARCHAR(80) NULL,
  finder_contact VARCHAR(120) NULL,
  contact_share_consent TINYINT(1) NOT NULL DEFAULT 0,
  phone_verified_snapshot TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  location_text VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  accuracy_m DECIMAL(10,2) NULL,
  location_source ENUM('GPS', 'MAP', 'TEXT', 'NONE') NOT NULL DEFAULT 'NONE',
  risk_state ENUM('ACCEPTED', 'REVIEW', 'BLOCKED') NOT NULL DEFAULT 'ACCEPTED',
  idempotency_key VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY recovery_contact_owner_created_index (owner_id, created_at),
  KEY recovery_contact_pet_created_index (pet_id, created_at),
  KEY recovery_contact_session_created_index (finder_session_id, created_at),
  UNIQUE KEY recovery_contact_session_idempotency_unique (finder_session_id, idempotency_key),
  CONSTRAINT recovery_contact_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT recovery_contact_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT recovery_contact_session_fk
    FOREIGN KEY (finder_session_id) REFERENCES finder_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sighting_evidence (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  finder_session_id VARCHAR(64) NULL,
  sighting_id VARCHAR(64) NULL,
  recovery_contact_event_id VARCHAR(64) NULL,
  evidence_type ENUM('PHOTO') NOT NULL DEFAULT 'PHOTO',
  storage_url VARCHAR(512) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  status ENUM('STAGED', 'ATTACHED', 'DELETED') NOT NULL DEFAULT 'STAGED',
  expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY sighting_evidence_session_created_index (finder_session_id, created_at),
  KEY sighting_evidence_pet_created_index (pet_id, created_at),
  KEY sighting_evidence_sha_index (sha256),
  KEY sighting_evidence_expires_index (status, expires_at),
  CONSTRAINT sighting_evidence_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT sighting_evidence_session_fk
    FOREIGN KEY (finder_session_id) REFERENCES finder_sessions(id) ON DELETE SET NULL,
  CONSTRAINT sighting_evidence_sighting_fk
    FOREIGN KEY (sighting_id) REFERENCES sightings(id) ON DELETE CASCADE,
  CONSTRAINT sighting_evidence_contact_fk
    FOREIGN KEY (recovery_contact_event_id) REFERENCES recovery_contact_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_devices (
  expo_push_token VARCHAR(255) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  platform ENUM('ios', 'android') NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  location_accuracy_m DECIMAL(10,2) NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (expo_push_token),
  KEY push_devices_user_index (user_id, enabled),
  KEY push_devices_location_index (latitude, longitude),
  CONSTRAINT push_devices_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expo_push_receipts (
  receipt_id VARCHAR(128) NOT NULL,
  expo_push_token VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (receipt_id),
  KEY expo_push_receipts_created_index (created_at),
  KEY expo_push_receipts_token_index (expo_push_token),
  CONSTRAINT expo_push_receipts_token_fk
    FOREIGN KEY (expo_push_token) REFERENCES push_devices(expo_push_token) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL,
  data JSON NULL,
  read_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY notifications_user_created_index (user_id, created_at),
  KEY notifications_user_read_index (user_id, read_at),
  CONSTRAINT notifications_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS health_records (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  clinic_id VARCHAR(64) NOT NULL,
  vet_id VARCHAR(128) NOT NULL,
  record_type VARCHAR(50) NOT NULL,
  title VARCHAR(120) NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  vaccine_name VARCHAR(120) NULL,
  dose_number VARCHAR(30) NULL,
  lot_number VARCHAR(80) NULL,
  next_due_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY health_records_pet_index (pet_id),
  KEY health_records_pet_occurred_index (pet_id, occurred_at),
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
  status ENUM('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  reason TEXT NULL,
  reminder_minutes_before INT NOT NULL DEFAULT 1440,
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

CREATE TABLE IF NOT EXISTS health_reminders (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  clinic_id VARCHAR(64) NULL,
  source_type ENUM('MANUAL', 'VACCINATION', 'APPOINTMENT') NOT NULL DEFAULT 'MANUAL',
  source_id VARCHAR(64) NULL,
  title VARCHAR(120) NOT NULL,
  notes TEXT NULL,
  due_at DATETIME NOT NULL,
  notify_at DATETIME NOT NULL,
  status ENUM('PENDING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY health_reminders_owner_due_index (owner_id, status, due_at),
  KEY health_reminders_pet_due_index (pet_id, due_at),
  KEY health_reminders_source_index (source_type, source_id),
  UNIQUE KEY health_reminders_source_unique (source_type, source_id, owner_id),
  CONSTRAINT health_reminders_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT health_reminders_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT health_reminders_clinic_fk
    FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL,
  data JSON NULL,
  scheduled_at DATETIME NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'SENT', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  dedupe_key VARCHAR(191) NULL,
  claimed_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY scheduled_notifications_dedupe_unique (dedupe_key),
  KEY scheduled_notifications_due_index (status, scheduled_at),
  KEY scheduled_notifications_user_index (user_id, status),
  CONSTRAINT scheduled_notifications_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS pet_recovery_tags (
  id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  token_id CHAR(32) NOT NULL,
  short_code VARCHAR(16) NOT NULL,
  label VARCHAR(60) NOT NULL,
  tag_type ENUM('PRINT','COLLAR','HARNESS','STICKER','OTHER') NOT NULL DEFAULT 'PRINT',
  status ENUM('ACTIVE','LOST','REVOKED') NOT NULL DEFAULT 'ACTIVE',
  last_scanned_at TIMESTAMP NULL DEFAULT NULL,
  scan_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY pet_recovery_tags_token_unique (token_id),
  UNIQUE KEY pet_recovery_tags_short_code_unique (short_code),
  KEY pet_recovery_tags_pet_status_index (pet_id, status),
  CONSTRAINT pet_recovery_tags_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recovery_tag_scans (
  id VARCHAR(64) NOT NULL,
  tag_id VARCHAR(64) NOT NULL,
  pet_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  finder_session_id VARCHAR(64) NOT NULL,
  source ENUM('QR','CODE') NOT NULL DEFAULT 'QR',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY recovery_tag_scans_session_tag_unique (tag_id, finder_session_id),
  KEY recovery_tag_scans_pet_created_index (pet_id, created_at),
  KEY recovery_tag_scans_owner_created_index (owner_id, created_at),
  CONSTRAINT recovery_tag_scans_tag_fk
    FOREIGN KEY (tag_id) REFERENCES pet_recovery_tags(id) ON DELETE CASCADE,
  CONSTRAINT recovery_tag_scans_pet_fk
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT recovery_tag_scans_owner_fk
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT recovery_tag_scans_finder_fk
    FOREIGN KEY (finder_session_id) REFERENCES finder_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Durable per-device push jobs share the inbox transaction; provider failures remain retryable.
CREATE TABLE IF NOT EXISTS push_delivery_jobs (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  notification_id VARCHAR(64) NOT NULL,
  expo_push_token VARCHAR(255) NOT NULL,
  status ENUM('PENDING','PROCESSING','SENT','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TIMESTAMP NULL DEFAULT NULL,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  last_error VARCHAR(160) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_notification_device (notification_id, expo_push_token),
  KEY idx_push_due (status, available_at),
  CONSTRAINT fk_push_delivery_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
