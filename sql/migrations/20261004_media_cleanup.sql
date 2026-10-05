CREATE TABLE IF NOT EXISTS media_cleanup_jobs (
  storage_url VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  not_before DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (storage_url),
  KEY media_cleanup_due_index (not_before)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
