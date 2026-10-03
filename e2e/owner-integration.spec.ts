import { expect, test } from "@playwright/test";

const integration = process.env.PETCONNECT_E2E_INTEGRATION === "1";

test.describe("owner integration", () => {
  test.skip(
    !integration,
    "Requires disposable MySQL and Firebase Auth emulator.",
  );

  test("owner manages multiple pets and the Pet ID lifecycle", async ({
    page,
    context,
  }) => {
    const unique = Date.now().toString(36);
    const email = `owner-${unique}@example.test`;
    const password = `PetConnect-${unique}-Pass!`;

    await page.goto("/create-account");
    await page.getByLabel("Full name").fill("PetConnect Test Owner");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByText(/Good (morning|afternoon|evening), PetConnect!/),
    ).toBeVisible();

    async function createPet(name: string) {
      await page
        .getByRole("button", { name: /Add pet/i })
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
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
      expect(recovery.active).toBeTruthy();
      expect(recovery.recoveryUrl).toContain("/recover?token=");
      return recovery.recoveryUrl!;
    }

    const firstRecoveryUrl = await createPet("Bantay");

    const publicPage = await context.newPage();
    await publicPage.goto(firstRecoveryUrl);
    await expect(publicPage.getByText("You found Bantay")).toBeVisible();
    await expect(publicPage.getByText("No active lost report")).toBeVisible();
    await publicPage.close();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await createPet("Luna");

    await page.goto("/my-pets");
    await expect(page.getByText("Bantay", { exact: true })).toBeVisible();
    await expect(page.getByText("Luna", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "View Luna Pet ID" }).click();
    await expect(page).toHaveURL(/\/pet-id\?id=/);
    await expect(page.getByText("Luna", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit pet" }).click();
    await page.getByLabel("Pet name").fill("Luna Updated");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByText("Luna Updated", { exact: true }).first(),
    ).toBeVisible();

    await page.goto("/my-pets");
    await page.getByRole("button", { name: "Report Bantay lost" }).click();
    await expect(page).toHaveURL(/\/alerts\?.*petId=/);
    await expect(page.getByText("Publish lost report")).toBeVisible();
    await expect(
      page.getByText("Bantay", { exact: true }).first(),
    ).toBeVisible();

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

    const oldQrPage = await context.newPage();
    await oldQrPage.goto(firstRecoveryUrl);
    await expect(
      oldQrPage.getByText("Recovery profile unavailable"),
    ).toBeVisible();
    await oldQrPage.close();

    const rotatedQrPage = await context.newPage();
    await rotatedQrPage.goto(rotated.recoveryUrl!);
    await expect(rotatedQrPage.getByText("You found Bantay")).toBeVisible();
    await rotatedQrPage.close();

    const revokeResponse = page.waitForResponse(
      (response) =>
        /\/v1\/pets\/[^/]+\/recovery$/.test(response.url()) &&
        response.request().method() === "DELETE",
    );
    await page.getByRole("button", { name: "Disable QR" }).click();
    expect((await revokeResponse).ok()).toBeTruthy();

    const revokedQrPage = await context.newPage();
    await revokedQrPage.goto(rotated.recoveryUrl!);
    await expect(
      revokedQrPage.getByText("Recovery profile unavailable"),
    ).toBeVisible();
    await revokedQrPage.close();
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
