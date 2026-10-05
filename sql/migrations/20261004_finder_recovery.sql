-- Anonymous finder sessions, recovery evidence, progressive trust metadata, and non-lost found-pet contacts.

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

ALTER TABLE sightings
  MODIFY COLUMN latitude DECIMAL(10,7) NULL,
  MODIFY COLUMN longitude DECIMAL(10,7) NULL,
  ADD COLUMN finder_session_id VARCHAR(64) NULL AFTER finder_user_id,
  ADD COLUMN encounter_type ENUM('SEEN', 'HAVE_PET') NOT NULL DEFAULT 'SEEN' AFTER finder_session_id,
  ADD COLUMN location_text VARCHAR(255) NULL AFTER notes,
  ADD COLUMN location_source ENUM('GPS', 'MAP', 'TEXT', 'NONE', 'LEGACY') NOT NULL DEFAULT 'LEGACY' AFTER accuracy_m,
  ADD COLUMN contact_share_consent TINYINT(1) NOT NULL DEFAULT 0 AFTER location_source,
  ADD COLUMN phone_verified_snapshot TINYINT(1) NOT NULL DEFAULT 0 AFTER contact_share_consent,
  ADD COLUMN risk_state ENUM('ACCEPTED', 'REVIEW', 'BLOCKED') NOT NULL DEFAULT 'ACCEPTED' AFTER phone_verified_snapshot,
  ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER risk_state,
  ADD KEY sightings_finder_session_index (finder_session_id, created_at),
  ADD UNIQUE KEY sightings_session_idempotency_unique (finder_session_id, idempotency_key),
  ADD CONSTRAINT sightings_finder_session_fk
    FOREIGN KEY (finder_session_id) REFERENCES finder_sessions(id) ON DELETE SET NULL;

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
