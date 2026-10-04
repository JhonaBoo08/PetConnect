import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const finderPhoto = readFileSync("frontend/assets/images/logo.png");

const integration = process.env.PETCONNECT_E2E_INTEGRATION === "1";
const developmentUrl = process.env.PETCONNECT_E2E_DEV_URL?.trim();
function browserRecoveryUrl(value: string) {
  const url = new URL(value);
  return developmentUrl
    ? new URL(url.pathname + url.search, developmentUrl).toString()
    : value;
}

test.describe("owner integration", () => {
  test.skip(
    !integration,
    "Requires disposable MySQL and Firebase Auth emulator.",
  );

  test.use({ viewport: { width: 412, height: 915 } });

  test("owner manages multiple pets and the Pet ID lifecycle", async ({
    page,
    context,
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    async function capture(view: Page, name: string) {
      expect(
        await view.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBeTruthy();
      if (process.env.PETCONNECT_CAPTURE_UI === "1") {
        await view.screenshot({
          path: testInfo.outputPath(name + ".png"),
          fullPage: true,
        });
      }
    }
    async function expectFinderPhoto() {
      const photo = page.getByRole("img", {
        name: "Finder-submitted pet photo",
      });
      await expect(photo).toBeVisible();
      await expect
        .poll(() =>
          photo.evaluate((element) => {
            const image =
              element instanceof HTMLImageElement
                ? element
                : element.querySelector("img");
            return image?.naturalWidth || 0;
          }),
        )
        .toBeGreaterThan(0);
    }
    const unique = Date.now().toString(36);
    const email = `owner-${unique}@example.test`;
    const password = `PetConnect-${unique}-Pass!`;

    await page.goto("/create-account");
    await page.getByLabel("Full name").fill("PetConnect Test Owner");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByText(/Good (morning|afternoon|evening), PetConnect!/),
    ).toBeVisible();

    async function createPet(name: string) {
      await page.goto("/my-pets");
      await page
        .getByRole("button", { name: /Add (pet|your first pet)/i })
        .first()
        .click();
      await expect(page).toHaveURL(/\/add-pet$/);
      await page.getByLabel("Pet name").fill(name);
      await page.getByRole("button", { name: "Species" }).click();
      await page.getByText("Dog", { exact: true }).click();

      const recoveryResponse = page.waitForResponse(
        (response) =>
          /\/v1\/pets\/[^/]+\/recovery$/.test(response.url()) &&
          response.request().method() === "GET",
      );
      await page.getByRole("button", { name: "Save pet" }).click();
      const response = await recoveryResponse;
      expect(response.ok()).toBeTruthy();
      const recovery = (await response.json()) as {
        active: boolean;
        recoveryUrl: string | null;
      };
      await expect(page).toHaveURL(/\/pet-id\?id=/);
      await expect(
        page.getByText(name, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
      expect(recovery.active).toBeTruthy();
      expect(recovery.recoveryUrl).toContain("/recover?token=");
      return recovery.recoveryUrl!;
    }

    const firstRecoveryUrl = await createPet("Bantay");
    const finderContext = await browser.newContext({
      viewport: { width: 412, height: 915 },
    });
    const publicPage = await finderContext.newPage();
    await publicPage.goto(browserRecoveryUrl(firstRecoveryUrl), {
      waitUntil: "domcontentloaded",
    });
    await expect(publicPage.getByText("REGISTERED PET")).toBeVisible();
    await expect(publicPage.getByText("This Pet ID is active")).toBeVisible();
    await expect(
      publicPage.getByRole("button", { name: "I found this pet" }),
    ).toBeVisible();

    await capture(publicPage, "01-public-registered");
    await publicPage.getByRole("button", { name: "I found this pet" }).click();
    await capture(publicPage, "02-have-pet-camera");
    const firstPhotoChooser = publicPage.waitForEvent("filechooser");
    await publicPage
      .getByRole("button", { name: "Take a current photo" })
      .click();
    await (
      await firstPhotoChooser
    ).setFiles({
      name: "bantay-found.png",
      mimeType: "image/png",
      buffer: finderPhoto,
    });
    await publicPage
      .getByLabel("Finder location description")
      .fill("Test guardhouse");
    await capture(publicPage, "03-have-pet-location");
    await publicPage
      .getByRole("button", { name: "Send found-pet report" })
      .click();
    await expect(publicPage.getByText("Found-pet report sent")).toBeVisible();
    await capture(publicPage, "04-non-lost-found-success");

    await page.goto("/alerts?mode=updates");
    await expect(
      page.getByRole("button", { name: /Someone says they found Bantay/ }),
    ).toBeVisible();
    await capture(page, "05-owner-notification");
    await page
      .getByRole("button", { name: /Someone says they found Bantay/ })
      .click();
    await expect(page).toHaveURL(/\/recovery-report\?.*eventId=/);
    await expect(page.getByText("Finder report")).toBeVisible();
    await expect(page.getByText("HAS PET", { exact: true })).toBeVisible();
    await expect(page.getByText("Photo attached")).toBeVisible();
    await expectFinderPhoto();
    await capture(page, "06-owner-non-lost-evidence");
    await publicPage.close();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await createPet("Luna");

    await page.goto("/my-pets");
    await expect(page.getByText("Bantay", { exact: true })).toBeVisible();
    await expect(page.getByText("Luna", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "View Luna Pet ID" }).click();
    await expect(page).toHaveURL(/\/pet-id\?id=/);
    await expect(
      page.getByText("Luna", { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Edit pet" }).click();
    await expect(page.getByLabel("Pet name")).toHaveValue("Luna");
    await page.getByLabel("Pet name").fill("Luna Updated");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page
        .getByText("Luna Updated", { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await page.goto("/my-pets");
    await page.getByRole("button", { name: "Report Bantay lost" }).click();
    await expect(page).toHaveURL(/\/alerts\?.*petId=/);
    await expect(
      page.getByRole("button", { name: "Publish lost report", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText("Bantay", { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 7.4479, longitude: 125.8079 });
    await page.getByLabel("Last seen").fill("Tagum test landmark");
    await page
      .getByRole("button", { name: "Publish lost report", exact: true })
      .click();
    await expect(page.getByText(/Bantay is now in Recovery/)).toBeVisible();

    const finderPage = await finderContext.newPage();
    await finderPage.goto(browserRecoveryUrl(firstRecoveryUrl), {
      waitUntil: "domcontentloaded",
    });
    await expect(finderPage.getByText("LOST PET")).toBeVisible();
    await capture(finderPage, "07-public-lost-chooser");
    await finderPage.getByRole("button", { name: "I saw this pet" }).click();
    await capture(finderPage, "08-seen-fast-flow");
    await finderPage.evaluate(() => {
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
    await finderPage
      .getByRole("button", { name: "Use my current GPS" })
      .click();
    await expect(finderPage.getByRole("alert")).toContainText(
      "could not read your location",
    );
    await expect(finderPage.getByRole("alert")).toBeInViewport({ ratio: 0.5 });
    await capture(finderPage, "09-gps-denied-manual-fallback");
    await finderPage
      .getByLabel("Finder location description")
      .fill("Near the test landmark");
    await finderPage.getByLabel("Finder name").fill("Test Finder");
    await finderPage
      .getByLabel("Finder notes")
      .fill("Moving slowly toward the market");
    await finderPage.setViewportSize({ width: 360, height: 800 });
    await finderPage.getByLabel("Finder notes").scrollIntoViewIfNeeded();
    await finderPage.getByLabel("Finder notes").focus();
    await expect(finderPage.getByLabel("Finder notes")).toBeInViewport();
    await expect(finderPage.getByLabel("Finder notes")).toBeFocused();
    await capture(finderPage, "10-small-screen-keyboard-focus");
    await finderPage.setViewportSize({ width: 412, height: 915 });
    const submitRoute = /\/v1\/recovery\/[^/]+\/sightings$/;
    await finderPage.route(
      submitRoute,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "unavailable",
            message: "Submission temporarily unavailable. Please retry.",
          }),
        }),
      { times: 1 },
    );
    await finderPage.getByRole("button", { name: "Send sighting" }).click();
    await expect(finderPage.getByRole("alert")).toContainText("temporarily");
    await capture(finderPage, "11-submission-error");
    await finderPage.route(
      submitRoute,
      (route) =>
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({
            error: "rate-limited",
            message: "Please wait before sending another report.",
          }),
        }),
      { times: 1 },
    );
    await finderPage.getByRole("button", { name: "Send sighting" }).click();
    await expect(finderPage.getByRole("alert")).toContainText("wait");
    await capture(finderPage, "12-rate-limit");
    await finderPage.route(
      submitRoute,
      (route) =>
        route.fulfill({
          status: 428,
          contentType: "application/json",
          body: JSON.stringify({
            error: "phone-verification-required",
            message: "Verify a phone number before sending more reports.",
          }),
        }),
      { times: 1 },
    );
    await finderPage.getByRole("button", { name: "Send sighting" }).click();
    await expect(
      finderPage.getByText("Extra verification needed", { exact: true }),
    ).toBeVisible();
    await capture(finderPage, "13-progressive-verification");
    if (process.env.PETCONNECT_E2E_VERIFY_OTP === "1") {
      const phone = `+639${Date.now().toString().slice(-9)}`;
      await finderPage.getByLabel("Verification phone number").fill(phone);
      await finderPage
        .getByRole("button", { name: "Send verification code" })
        .click();
      let code: string | undefined;
      const mockUrl = process.env.PETCONNECT_E2E_SMSGATE_URL;
      if (mockUrl) {
        await expect(
          finderPage.getByText(/Local development code:/),
        ).toHaveCount(0);
        await expect
          .poll(async () => {
            const response = await fetch(
              mockUrl + "/test-code?phone=" + encodeURIComponent(phone),
              {
                headers: {
                  Authorization:
                    "Basic " +
                    Buffer.from("fixture:fixture-password").toString("base64"),
                },
              },
            );
            if (response.ok) code = (await response.json()).code;
            return Boolean(code);
          })
          .toBeTruthy();
      } else {
        const hint = finderPage.getByText(/Local development code:/);
        await expect(hint).toBeVisible();
        code = (await hint.textContent())?.match(/\d{6}/)?.[0];
      }
      expect(code).toBeTruthy();
      await finderPage.getByLabel("Verification code").fill(code!);
      await capture(finderPage, "18-verification-code-entry");
      await finderPage
        .getByRole("button", { name: "Verify and send report" })
        .click();
    } else {
      await finderPage.getByRole("button", { name: "Back to report" }).click();
      await finderPage.getByRole("button", { name: "Send sighting" }).click();
    }
    await expect(finderPage.getByText("Sighting sent")).toBeVisible();
    await capture(finderPage, "14-sighting-success");
    await finderPage
      .getByRole("button", { name: "Return to recovery profile" })
      .click();

    await finderPage.reload({ waitUntil: "domcontentloaded" });
    await expect(finderPage.getByText("LOST PET")).toBeVisible();
    await finderContext.grantPermissions(["geolocation"]);
    await finderContext.setGeolocation({
      latitude: 7.4479,
      longitude: 125.8079,
    });
    await finderPage.getByRole("button", { name: "I have this pet" }).click();
    const secondPhotoChooser = finderPage.waitForEvent("filechooser");
    await finderPage
      .getByRole("button", { name: "Take a current photo" })
      .click();
    await (
      await secondPhotoChooser
    ).setFiles({
      name: "bantay-current.png",
      mimeType: "image/png",
      buffer: finderPhoto,
    });
    await finderPage
      .getByLabel("Finder location description")
      .fill("Safe at the test guardhouse");
    await finderPage
      .getByRole("button", { name: "Use my current GPS" })
      .click();
    await expect(finderPage.getByText(/Location attached/)).toBeVisible();
    await capture(finderPage, "15-have-pet-gps-approved");
    await finderPage.getByLabel("Finder contact").fill("+639171234567");
    await finderPage
      .getByRole("checkbox", {
        name: "Share my contact details with the pet owner",
      })
      .click();
    await capture(finderPage, "16-have-pet-details-review");
    await finderPage
      .getByRole("button", { name: "Send found-pet report" })
      .click();
    await expect(finderPage.getByText("Found-pet report sent")).toBeVisible();

    const finderAuthProbe = await finderContext.newPage();
    await finderAuthProbe.goto(
      new URL("/profile", browserRecoveryUrl(firstRecoveryUrl)).toString(),
    );
    await expect(finderAuthProbe).toHaveURL(/\/$/);
    await finderAuthProbe.close();

    await page.goto("/alerts?mode=updates");
    await expect(
      page.getByRole("button", { name: /A finder says they have Bantay/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /A finder says they have Bantay/ })
      .click();
    await expect(page).toHaveURL(/\/recovery-report\?.*sightingId=/);
    await expect(page.getByText("HAS PET", { exact: true })).toBeVisible();
    await expect(page.getByText("Photo attached")).toBeVisible();
    await expectFinderPhoto();
    await capture(page, "17-owner-lost-pet-evidence");
    await page
      .getByRole("button", { name: "I confirmed my pet is reunited" })
      .click();
    await expect(page.getByText("Confirm Bantay is reunited?")).toBeVisible();
    await page.getByRole("button", { name: "Mark reunited" }).click();
    await expect(page.getByText(/Bantay is marked reunited/)).toBeVisible();
    await finderPage.goto(browserRecoveryUrl(firstRecoveryUrl), {
      waitUntil: "domcontentloaded",
    });
    await expect(finderPage.getByText("REGISTERED PET")).toBeVisible();
    await expect(finderPage.getByText("This Pet ID is active")).toBeVisible();
    await finderPage.close();

    await page.goto("/privacy-settings");
    const publicPhone = page.getByRole("switch", {
      name: "Show phone on public Pet ID",
    });
    await expect(publicPhone).not.toBeChecked();
    await publicPhone.click();
    await expect(publicPhone).toBeChecked();

    await page.goto("/clinic-dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/my-pets");
    await page.getByRole("button", { name: "View Bantay Pet ID" }).click();

    const rotateResponse = page.waitForResponse(
      (response) =>
        /\/v1\/pets\/[^/]+\/recovery\/rotate$/.test(response.url()) &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Regenerate QR" }).click();
    const rotated = (await (await rotateResponse).json()) as {
      active: boolean;
      recoveryUrl: string | null;
    };
    expect(rotated.recoveryUrl).toBeTruthy();
    expect(rotated.recoveryUrl).not.toBe(firstRecoveryUrl);

    const oldQrPage = await finderContext.newPage();
    await oldQrPage.goto(browserRecoveryUrl(firstRecoveryUrl), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      oldQrPage.getByText("Recovery profile unavailable"),
    ).toBeVisible();
    await oldQrPage.close();

    const rotatedQrPage = await finderContext.newPage();
    await rotatedQrPage.goto(browserRecoveryUrl(rotated.recoveryUrl!), {
      waitUntil: "domcontentloaded",
    });
    await expect(rotatedQrPage.getByText("REGISTERED PET")).toBeVisible();
    await expect(
      rotatedQrPage.getByText("This Pet ID is active"),
    ).toBeVisible();
    await rotatedQrPage.close();

    const revokeResponse = page.waitForResponse(
      (response) =>
        /\/v1\/pets\/[^/]+\/recovery$/.test(response.url()) &&
        response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Disable QR" }).click();
    expect((await revokeResponse).ok()).toBeTruthy();

    const revokedQrPage = await finderContext.newPage();
    await revokedQrPage.goto(browserRecoveryUrl(rotated.recoveryUrl!), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      revokedQrPage.getByText("Recovery profile unavailable"),
    ).toBeVisible();
    await revokedQrPage.close();
    await finderContext.close();
  });
});

test.describe("route guards", () => {
  test.skip(!integration, "Requires Firebase Auth emulator.");

  test("guest cannot enter owner or clinic protected routes", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/clinic-dashboard");
    await expect(page).toHaveURL(/\/$/);
  });
});
