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
