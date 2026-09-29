-- Apply once to databases created before pet profile fields were added.
ALTER TABLE pets
  ADD COLUMN sex VARCHAR(10) NULL AFTER birth_date,
  ADD COLUMN age_label VARCHAR(50) NULL AFTER sex,
  ADD COLUMN identifying_details TEXT NULL AFTER age_label;
