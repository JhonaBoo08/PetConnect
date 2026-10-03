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
