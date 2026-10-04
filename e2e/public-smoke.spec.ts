import { expect, test } from "@playwright/test";

test("public welcome routes into sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Pet-Connect")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /get started/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /get started/i }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText("Welcome back")).toBeVisible();
});

test("recovery page fails safely without a signed token", async ({ page }) => {
  await page.goto("/recover");
  await expect(page.getByText("Recovery profile unavailable")).toBeVisible();
  await expect(
    page.getByText("This recovery link is incomplete."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /scan another qr/i }),
  ).toBeVisible();
});

test("GPS denial keeps the manual finder fallback visible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.route("**/v1/recovery/mobile-fallback-test", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pet: {
          name: "Bantay",
          species: "Dog",
          breed: "Aspin",
          sex: "Male",
          ageLabel: "3 years",
          identifyingDetails: "Brown coat",
          photoUrl: null,
        },
        owner: { displayName: "Bantay Owner", phone: null },
        activeReport: {
          status: "LOST",
          lastSeenText: "Freedom Park",
          details: "Green collar",
          latitude: 7.448,
          longitude: 125.808,
          accuracyM: 150,
          reportedAt: "2026-10-04T00:00:00Z",
          lastSightedAt: null,
          sightingCount: 0,
        },
      }),
    }),
  );
  await page.route("**/v1/recovery/finder-session", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        credential: "mobile-test-session",
        expiresAt: "2099-01-01T00:00:00Z",
        phoneVerified: false,
        verificationRequired: false,
      }),
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure?: PositionErrorCallback,
        ) =>
          failure?.({
            code: 1,
            message: "Permission denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError),
      },
    });
  });
  await page.goto("/recover?token=mobile-fallback-test", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "I saw this pet" }).click();
  await page.getByRole("button", { name: "Use my current GPS" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "could not read your location",
  );
  await expect(page.getByRole("alert")).toBeInViewport({ ratio: 0.5 });
  const manualLocation = page.getByLabel("Finder location description");
  await manualLocation.fill("Market entrance");
  await expect(manualLocation).toHaveValue("Market entrance");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
