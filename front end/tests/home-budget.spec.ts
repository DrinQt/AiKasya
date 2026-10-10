import { test, expect } from "@playwright/test";

test("Home bar shows immediately and expands only one inline conversation", async ({
  page,
}) => {
  await page.goto("/#home");
  await expect(
    page.getByText("Hello, I'm Kasya, ask me anything"),
  ).toBeVisible();
  const bar = page.getByRole("button", { name: "AI Chat", exact: true });
  const logo = page.locator(".header-logo");
  expect(await logo.evaluate((img) => getComputedStyle(img).objectFit)).toBe(
    "contain",
  );
  await bar.click();
  await expect(page.locator(".chat-screen")).toHaveCount(1);
  await expect(page.locator(".floating-chat")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "AI Chat" })).toBeVisible();
  await page.getByRole("textbox").fill("Help with groceries");
  await page.getByRole("button", { name: "Send message" }).click();
  await bar.click();
  await expect(page.locator(".chat-screen")).toHaveCount(0);
  await bar.click();
  await expect(
    page.getByText("Help with groceries", { exact: true }),
  ).toBeVisible();
});

test("Budget presets, stepper limits, custom entry and saving persist", async ({
  page,
}) => {
  await page.goto("/#budget");
  await page.getByRole("button", { name: "₱1,000", exact: true }).click();
  const budget = page.getByLabel("Food budget (₱)", { exact: true });
  await expect(budget).toHaveValue("1000");
  await budget.fill("725.50");
  const people = page.getByLabel("Household size", { exact: true });
  await people.fill("1");
  await expect(
    page.getByRole("button", { name: "Decrease Household size" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Increase Household size" }).click();
  await expect(people).toHaveValue("2");
  const days = page.getByLabel("Number of days", { exact: true });
  await days.fill("30");
  await expect(
    page.getByRole("button", { name: "Increase Number of days" }),
  ).toBeDisabled();
  await days.fill("4");
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page).toHaveURL(/#home$/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "₱725.50 My Budget" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Household size" }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("combobox", { name: "Number of days" }),
  ).toHaveValue("4");
});

test("Expanded Home chat fits all requested mobile widths", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#home");
    await page.reload();
    await page.getByRole("button", { name: "AI Chat", exact: true }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
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
