-- Private pet microchip identifier. Public recovery exposes only a boolean microchipped flag.
ALTER TABLE pets
  ADD COLUMN microchip_number VARCHAR(64) NULL AFTER identifying_details,
  ADD UNIQUE KEY pets_microchip_unique (microchip_number);
