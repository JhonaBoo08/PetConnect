import assert from "node:assert/strict";
import { test } from "node:test";

import { nearbyMatchReasons } from "../src/recovery-network.js";

test("nearby matching explains species, breed, and appearance matches", () => {
  const report = {
    species: "Dog",
    breed: "Aspin",
    identifyingDetails: "White chest, brown coat, green collar",
    details: "Friendly and may approach people",
  };

  assert.deepEqual(
    nearbyMatchReasons(report, {
      species: "dog",
      breed: "aspin",
      appearance: "brown coat green collar",
    }),
    ["Species match", "Breed match", "Appearance match"],
  );
});

test("nearby matching stays explainable and does not invent a match", () => {
  const report = {
    species: "Cat",
    breed: "Domestic Shorthair",
    identifyingDetails: "Black coat with white paws",
    details: "Blue collar",
  };

  assert.deepEqual(
    nearbyMatchReasons(report, {
      species: "Dog",
      breed: "Beagle",
      appearance: "golden red harness",
    }),
    [],
  );
});

test("appearance matching is case-insensitive and token based", () => {
  const report = {
    species: "Dog",
    breed: null,
    identifyingDetails: "Distinct WHITE left PAW",
    details: null,
  };

  assert.deepEqual(nearbyMatchReasons(report, { appearance: "white paw" }), [
    "Appearance match",
  ]);
});
