import { expect, test, type Page } from "@playwright/test";

test.describe("mobile navigation and recovery redesign", () => {
  test.skip(
    process.env.PETCONNECT_E2E_INTEGRATION !== "1",
    "Requires local API, MySQL, and Firebase Auth emulator.",
  );
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps all owner features reachable through focused roots and report flows", async ({
    page,
    context,
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 7.4479, longitude: 125.8079 });

    async function capture(name: string, view: Page = page) {
      await expect(view.getByRole("alert")).toHaveCount(0);
      expect(
        await view.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (process.env.PETCONNECT_CAPTURE_UI === "1") {
        if (await view.getByLabel("Interactive recovery map").count()) {
          await expect(
            view.locator(".leaflet-overlay-pane path").first(),
          ).toBeAttached();
          await expect(
            view.locator(".leaflet-tile-loaded").first(),
          ).toBeAttached();
        }
        await view.screenshot({ path: testInfo.outputPath(name + ".png") });
      }
    }
    async function root(label: string, route: string) {
      await page.getByRole("tab", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp("/" + route + "(?:\\?.*)?$"));
      await expect(
        page.getByRole("button", { name: "Go back", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: label, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }
    const unique = Date.now().toString(36);
    await page.goto("/create-account");
    await page.getByLabel("Full name").fill("Mobile Review Owner");
    await page
      .getByLabel("Email address")
      .fill("mobile-" + unique + "@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("PetConnect-" + unique + "-Pass!");
    await page
      .getByLabel("Confirm password")
      .fill("PetConnect-" + unique + "-Pass!");
    await page
      .getByRole("button", { name: "Create Account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("button", { name: "Add your first pet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Report Lost Pet" }),
    ).toHaveCount(0);
    await capture("01-home-empty");

    await root("Pets", "my-pets");
    await expect(
      page.getByRole("button", { name: "Add pet", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add your first pet" }),
    ).toHaveCount(1);
    await capture("02-pets-empty");

    await root("Recovery", "alerts");
    await expect(
      page.getByRole("tab", { name: "Nearby", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tab", { name: "Updates", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Report Lost Pet", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("tab", { name: "My Reports", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Add a pet", exact: true }),
    ).toBeVisible();
    await capture("03-recovery-empty");

    async function createPet(name: string) {
      await page.goto("/my-pets");
      await page
        .getByRole("button", { name: /Add (pet|your first pet)/i })
        .click();
      await page.getByLabel("Pet name").fill(name);
      await page.getByRole("button", { name: "Species", exact: true }).click();
      await page.getByRole("button", { name: "Dog", exact: true }).click();
      await page.getByLabel("Breed").fill("Aspin");
      await page.getByLabel("Age", { exact: true }).fill("3 years");
      const recovery = page.waitForResponse(
        (response) =>
          /\/v1\/pets\/[^/]+\/recovery$/.test(response.url()) &&
          response.request().method() === "GET",
      );
      await page.getByRole("button", { name: "Save pet", exact: true }).click();
      const response = await recovery;
      expect(response.ok()).toBe(true);
      await expect(
        page.getByRole("button", { name: "Edit pet", exact: true }),
      ).toBeVisible();
      const data = await response.json();
      const url = new URL(data.recoveryUrl);
      return new URL(
        url.pathname + url.search,
        testInfo.project.use.baseURL as string,
      ).toString();
    }
    const recoveryUrl = await createPet("Bantay");
    await createPet("Luna With A Longer Name");
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: "Open Bantay", exact: true }),
    ).toBeVisible();
    await capture("04-home");

    await root("Pets", "my-pets");
    for (const label of [
      "View Bantay Pet ID",
      "Bantay care and health",
      "Edit Bantay",
      "Report Bantay lost",
      "Open care calendar",
    ]) {
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    }
    await capture("05-pets");
    await page
      .getByRole("button", { name: "Bantay care and health", exact: true })
      .click();
    await expect(page).toHaveURL(/\/health-reminders\?petId=/);
    await expect(
      page.getByRole("button", { name: "Go back", exact: true }),
    ).toBeVisible();

    await page.goto("/scan");
    await expect(
      page.getByRole("button", { name: "Go back", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Scan", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("Camera access needed", { exact: true }),
    ).toBeVisible();
    await capture("06-scan");
    // Short screens must still allow camera instructions and navigation.
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(
      page.getByRole("tab", { name: "Profile", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Allow camera", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Allow camera", exact: true }),
    ).toBeInViewport();
    await capture("07-scan-landscape");
    await page.setViewportSize({ width: 390, height: 844 });

    await root("Recovery", "alerts");
    await page.getByRole("tab", { name: "Nearby", exact: true }).click();
    await page
      .getByRole("button", { name: "Use my location", exact: true })
      .click();
    await expect(page.getByLabel("Interactive recovery map")).toBeVisible();
    await capture("08-recovery-nearby");

    await page
      .getByRole("button", { name: "Report Lost Pet", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Back to Recovery", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Nearby", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Recovery", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Select Bantay for lost report",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Last seen", { exact: true })
      .fill("Freedom Park, Tagum");
    await page.getByRole("button", { name: "Use my GPS", exact: true }).click();
    await expect(page.getByText(/Pin: 7\.44790/)).toBeVisible();
    await capture("09-report-pet-location");
    const reportMap = page.getByLabel("Interactive recovery map");
    await reportMap.click({ position: { x: 220, y: 110 } });
    await expect(page.getByText(/^Pin:/)).not.toContainText(
      "7.44790, 125.80790",
    );
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(page.locator(".leaflet-tile-loaded").first()).toHaveAttribute(
      "src",
      new RegExp("/16/"),
    );
    await page
      .getByLabel("Lost pet details", { exact: true })
      .fill("Yellow collar. Last moving toward the market.");
    await expect(page.locator(".leaflet-tile-loaded").first()).toHaveAttribute(
      "src",
      new RegExp("/16/"),
    );
    await page
      .getByRole("button", { name: "Publish lost report", exact: true })
      .scrollIntoViewIfNeeded();
    await capture("10-report-publish");
    await page
      .getByRole("button", { name: "Publish lost report", exact: true })
      .click();
    await expect(page.getByText(/Bantay is now in Recovery/)).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "My Reports", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Last seen", { exact: true })).toHaveCount(0);

    const finder = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["geolocation"],
    });
    const finderPage = await finder.newPage();
    for (const [latitude, longitude, place] of [
      [7.4488, 125.8101, "Market entrance"],
      [7.4502, 125.8125, "Barangay hall"],
    ] as const) {
      await finder.setGeolocation({ latitude, longitude });
      await finderPage.goto(recoveryUrl);
      await finderPage
        .getByRole("button", { name: "I saw this pet", exact: true })
        .click();
      await finderPage.getByLabel("Finder location description").fill(place);
      await finderPage
        .getByRole("button", { name: "Use my current GPS", exact: true })
        .click();
      await expect(finderPage.getByText(/Location attached/)).toBeVisible();
      await finderPage
        .getByRole("button", { name: "Submit Sighting", exact: true })
        .click();
      await expect(
        finderPage.getByText("Sighting sent", { exact: true }),
      ).toBeVisible();
    }
    await finder.close();

    await page.goto("/alerts?mode=reports");
    await expect(page.getByText("2 sightings", { exact: true })).toBeVisible();
    await page
      .getByText("Recovery trail", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(page.locator('path[stroke="#2F6F4E"]')).toBeVisible();
    await capture("11-my-reports-trail");
    const sighting = page
      .getByRole("button", { name: /Review Bantay sighting/ })
      .first();
    await sighting.scrollIntoViewIfNeeded();
    await capture("12-my-reports-sightings");
    await sighting.click();
    await expect(page).toHaveURL(/\/recovery-report\?.*sightingId=/);
    await expect(
      page.getByText("Finder report", { exact: true }),
    ).toBeVisible();

    await page.goto("/notifications");
    await expect(
      page.getByRole("button", { name: /Open.*Bantay/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Go back", exact: true }),
    ).toBeVisible();
    await capture("13-notifications");
    await page
      .getByRole("button", { name: /Open.*Bantay/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/recovery-report\?.*sightingId=/);

    await page.goto("/alerts?mode=reports");
    await page
      .getByRole("button", { name: "Mark Bantay Reunited", exact: true })
      .click();
    await expect(page.getByText("REUNITED", { exact: true })).toBeVisible();
    await capture("14-reunited");

    await root("Profile", "profile");
    await expect(
      page.getByRole("button", { name: "Privacy & preferences", exact: true }),
    ).toBeVisible();
    await capture("15-profile");
    await page.setViewportSize({ width: 320, height: 640 });
    await capture("16-profile-small");
    await page.setViewportSize({ width: 768, height: 1024 });
    await capture("17-profile-tablet");
  });
});
