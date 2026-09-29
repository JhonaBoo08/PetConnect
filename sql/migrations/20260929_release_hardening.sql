-- Release hardening: owner-controlled privacy defaults.
-- Public recovery phone and precise coordinates are opt-in.
-- Clinic phone access remains enabled by default for veterinary workflows,
-- but owners can disable it from Privacy settings.

ALTER TABLE users
  ADD COLUMN share_recovery_phone TINYINT(1) NOT NULL DEFAULT 0 AFTER phone,
  ADD COLUMN share_precise_recovery_location TINYINT(1) NOT NULL DEFAULT 0 AFTER share_recovery_phone,
  ADD COLUMN share_phone_with_clinics TINYINT(1) NOT NULL DEFAULT 1 AFTER share_precise_recovery_location;
