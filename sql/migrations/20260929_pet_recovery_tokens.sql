-- Apply once to databases created before revocable PetConnect recovery QR tokens were added.
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
