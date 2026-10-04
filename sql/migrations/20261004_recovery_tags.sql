-- Multi-tag recovery identities and scan history.
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
