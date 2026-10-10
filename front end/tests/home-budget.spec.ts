import { chooseNumber } from "./helpers/numberSheet";
import { test, expect } from "@playwright/test";

test("Home has one inputs-first planning entry", async ({ page }) => {
  await page.goto("/#home");
  await expect(
    page.getByRole("button", { name: "AI Chat", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Food budget (\u20b1)")).toBeVisible();
  await expect(page.locator(".chat-screen")).toHaveCount(0);
});

test("Budget presets, stepper limits, custom entry and saving persist", async ({
  page,
}) => {
  await page.goto("/#budget");
  await page.getByRole("button", { name: "₱1,000", exact: true }).click();
  const budget = page.getByLabel("Food budget (₱)", { exact: true });
  await expect(budget).toHaveValue("1000");
  await budget.fill("725.50");
  const people = page.getByRole("button", { name: /^Household size:/ });
  await chooseNumber(page, "Household size", "1");
  await expect(
    page.getByRole("button", { name: "Decrease Household size" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Increase Household size" }).click();
  await expect(people).toHaveAttribute("data-value", "2");
  const days = page.getByRole("button", { name: /^Number of days:/ });
  await chooseNumber(page, "Number of days", "30");
  await expect(
    page.getByRole("button", { name: "Increase Number of days" }),
  ).toBeDisabled();
  await chooseNumber(page, "Number of days", "4");
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page).toHaveURL(/#home$/);
  await page.reload();
  await expect(page.locator(".budget-card input")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Household size:/ }),
  ).toHaveAttribute("data-value", "2");
  await expect(
    page.getByRole("button", { name: /^Number of days:/ }),
  ).toHaveAttribute("data-value", "4");
});

test("Planning inputs fit all requested mobile widths", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#home");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Plan My Meals" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `screenshots/home-chat-${width}.png`,
      fullPage: true,
    });
  }
});
