import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Real separate browser storage reproduces two judge sessions on one demo URL.
test("two judges keep independent authentication and pets on the public demo", async ({
  browser,
}, testInfo) => {
  test.skip(
    process.env.PETCONNECT_E2E_INTEGRATION !== "1" ||
      !process.env.PETCONNECT_E2E_DEV_URL,
    "Requires the running demo stack.",
  );
  test.setTimeout(300_000);
  const origin = testInfo.project.use.baseURL as string;
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext({ viewport: { width: 412, height: 915 } }),
  ]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const run = Date.now().toString(36);
  const emails = ["a", "b"].map(
    (letter) => `clone-judge-${letter}-${run}@example.test`,
  );
  const pets = ["Judge A pet", "Judge B pet"];
  const tokens: string[] = [];
  try {
    for (const [index, page] of pages.entries()) {
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (/petconnect-api|identitytoolkit|securetoken/.test(url.pathname)) {
          expect(url.origin).toBe(origin);
          expect(url.hostname).not.toMatch(/^(localhost|127\.)/);
        }
      });
      await page.goto(origin + "/create-account");
      await page
        .getByLabel("Full name")
        .fill("Clone Judge " + (index ? "B" : "A"));
      await page.getByLabel("Email address").fill(emails[index]);
      await page
        .getByLabel("Password", { exact: true })
        .fill("PetConnect-Clone-Password!");
      await page
        .getByLabel("Confirm password")
        .fill("PetConnect-Clone-Password!");
      const signup = page.waitForResponse(
        (response) =>
          response.url().includes("accounts:signUp") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Create Account", exact: true })
        .click();
      tokens[index] = (await (await signup).json()).idToken;
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.getByRole("tab", { name: "Pets", exact: true }).click();
      await page
        .getByRole("button", { name: "Add your first pet", exact: true })
        .click();
      await page.getByLabel("Pet name").fill(pets[index]);
      await page.getByRole("button", { name: "Species", exact: true }).click();
      await page.getByRole("button", { name: "Dog", exact: true }).click();
      if (index === 0) {
        const chooser = page.waitForEvent("filechooser");
        await page
          .getByRole("button", { name: "Add pet photo", exact: true })
          .click();
        await (
          await chooser
        ).setFiles({
          name: "clone-pet.png",
          mimeType: "image/png",
          buffer: readFileSync("frontend/assets/images/logo.png"),
        });
        await expect(
          page.getByText("Selected pet photo", { exact: true }),
        ).toBeVisible();
      }
      await page.getByRole("button", { name: "Save pet", exact: true }).click();
      await expect(page).toHaveURL(/\/pet-id\?id=/);
      await page.getByRole("button", { name: "Edit pet", exact: true }).click();
      await page.getByLabel("Breed").fill("Fresh clone breed");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page).toHaveURL(/\/pet-id\?id=/);
      await page.getByRole("button", { name: "Edit pet", exact: true }).click();
      await expect(page.getByLabel("Breed")).toHaveValue("Fresh clone breed");
      await page.goto(origin + "/my-pets");
      await expect(
        page.getByRole("button", {
          name: `View ${pets[index]} Pet ID`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: `View ${pets[1 - index]} Pet ID`,
          exact: true,
        }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByRole("button", {
          name: `View ${pets[index]} Pet ID`,
          exact: true,
        }),
      ).toBeVisible();
    }
    for (const [index, page] of pages.entries()) {
      for (const label of ["Home", "Pets", "Recovery", "Profile", "Home"])
        await page.getByRole("tab", { name: label, exact: true }).click();
      await page.goto(origin + "/profile");
      await page
        .getByRole("button", { name: "Privacy & preferences", exact: true })
        .click();
      await expect(page).toHaveURL(/\/privacy-settings$/);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.goto(origin + "/profile");
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      await expect(
        page.getByText("Log out of PetConnect?", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Log out", exact: true })
        .last()
        .click();
      await expect(page).toHaveURL(/\/$/);
      // The other judge remains signed in when this judge signs out.
      const other = pages[1 - index];
      if (index === 0) {
        await other.goto(origin + "/my-pets");
        await expect(
          other.getByRole("button", {
            name: "View Judge B pet Pet ID",
            exact: true,
          }),
        ).toBeVisible();
      }
      await page.goto(origin + "/sign-in");
      await page.getByLabel("Email address").fill(emails[index]);
      await page
        .getByLabel("Password", { exact: true })
        .fill("incorrect-password");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await page
        .getByLabel("Password", { exact: true })
        .fill("PetConnect-Clone-Password!");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  } finally {
    // Remove only users identified by this test's exact credentials.
    for (const [index, token] of tokens.entries())
      if (token) {
        // Signup precedes the OWNER claim. Login refreshes it for scoped cleanup.
        const login = await contexts[0].request.post(
          origin +
            "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-petconnect-api-key",
          {
            data: {
              email: emails[index],
              password: "PetConnect-Clone-Password!",
              returnSecureToken: true,
            },
          },
        );
        const currentToken = login.ok() ? (await login.json()).idToken : token;
        const headers = { Authorization: "Bearer " + currentToken };
        const response = await contexts[0].request.get(
          origin + "/petconnect-api/v1/pets",
          { headers },
        );
        if (response.ok()) {
          const data = await response.json();
          for (const pet of data.pets ?? data) {
            const deleted = await contexts[0].request.delete(
              origin + "/petconnect-api/v1/pets/" + pet.id,
              { headers },
            );
            expect(deleted.ok()).toBe(true);
          }
        }
        await contexts[0].request.post(
          origin +
            "/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-petconnect-api-key",
          { data: { idToken: currentToken } },
        );
      }
    for (const context of contexts) await context.close();
  }
});
