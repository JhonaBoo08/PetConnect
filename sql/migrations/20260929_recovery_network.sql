-- Recovery network: lost reports, sightings, push devices, and durable notifications.
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

CREATE TABLE IF NOT EXISTS sightings (
  id VARCHAR(64) NOT NULL,
  report_id VARCHAR(64) NOT NULL,
  finder_user_id VARCHAR(128) NULL,
  finder_name VARCHAR(80) NULL,
  finder_contact VARCHAR(120) NULL,
  notes TEXT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sightings_report_created_index (report_id, created_at),
  KEY sightings_finder_index (finder_user_id),
  CONSTRAINT sightings_report_fk
    FOREIGN KEY (report_id) REFERENCES lost_reports(id) ON DELETE CASCADE,
  CONSTRAINT sightings_finder_user_fk
    FOREIGN KEY (finder_user_id) REFERENCES users(id) ON DELETE SET NULL
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

