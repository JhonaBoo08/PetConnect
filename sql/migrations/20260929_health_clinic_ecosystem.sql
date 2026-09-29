-- Health and clinic ecosystem.
-- Adds richer clinical records, appointment workflow, reminders, and durable scheduled notifications.

ALTER TABLE health_records
  ADD COLUMN title VARCHAR(120) NOT NULL DEFAULT 'Health record' AFTER record_type,
  ADD COLUMN occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER title,
  ADD COLUMN vaccine_name VARCHAR(120) NULL AFTER notes,
  ADD COLUMN dose_number VARCHAR(30) NULL AFTER vaccine_name,
  ADD COLUMN lot_number VARCHAR(80) NULL AFTER dose_number,
  ADD COLUMN next_due_at DATETIME NULL AFTER lot_number,
  ADD KEY health_records_pet_occurred_index (pet_id, occurred_at);

ALTER TABLE appointments
  MODIFY COLUMN status ENUM('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED')
    NOT NULL DEFAULT 'REQUESTED',
  ADD COLUMN reminder_minutes_before INT NOT NULL DEFAULT 1440 AFTER reason;

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

