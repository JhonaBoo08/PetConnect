import { expect, test } from "@playwright/test";

test("public welcome routes into sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Pet-Connect")).toBeVisible();
  await expect(page.getByRole("button", { name: /get started/i })).toBeVisible();

  await page.getByRole("button", { name: /get started/i }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText("Welcome back")).toBeVisible();
});

test("recovery page fails safely without a signed token", async ({ page }) => {
  await page.goto("/recover");
  await expect(page.getByText("Recovery profile unavailable")).toBeVisible();
  await expect(
    page.getByText("This recovery link is missing its PetConnect token."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /scan another qr/i })).toBeVisible();
});
