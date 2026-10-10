import { test, expect } from "@playwright/test";
import { chooseNumber } from "../helpers/numberSheet";
test("Production PWA reloads offline with local assets and saved data", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(2);
  await page.goto("/#budget");
  await page.getByRole("checkbox", { name: "Peanuts", exact: true }).check();
  await page
    .getByRole("button", { name: "Save Preferences", exact: true })
    .click();
  await chooseNumber(page, "Household size", "2");
  await chooseNumber(page, "Number of days", "4");
  await page.getByRole("button", { name: "Grocery List", exact: true }).click();
  await page.getByRole("checkbox", { name: "Vegetables (1 bunch)" }).check();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Grocery List", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Vegetables (1 bunch)" }),
  ).toBeChecked();
  await expect(
    page.getByText(
      "You are offline. Your saved plans and lists are still available.",
    ),
  ).toBeVisible();
  await page.goto("/#budget");
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Peanuts", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meals", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Meal Plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Peanuts", exact: true }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await expect(
    page.getByText(
      "Could not reach the local backend. Start the backend and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to Grocery List" }),
  ).toHaveCount(0);
  await expect(page.locator(".food-thumb img")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Household size: 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Number of days: 4", exact: true }),
  ).toBeVisible();
  await chooseNumber(page, "Household size", "3");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Household size: 3", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
      ),
  ).toBe(true);
});
