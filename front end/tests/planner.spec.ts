import { test, expect } from "@playwright/test";

test("Grocery controls leave the sticky Market Mode button clear", async ({
  page,
}) => {
  await page.goto("/#grocery");
  const market = page.getByRole("button", { name: "Market Mode", exact: true });
  await market.scrollIntoViewIfNeeded();
  expect(
    await market.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return button.contains(
        document.elementFromPoint(rect.right - 20, rect.top + rect.height / 2),
      );
    }),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "AI Chat", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/#grocery$/);
});

test("Insights shows an empty state without presenting sample bars as purchases", async ({
  page,
}) => {
  await page.goto("/#home");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("aikasya.v1")!);
    state.groceries = [];
    localStorage.setItem("aikasya.v1", JSON.stringify(state));
  });
  await page.goto("/#insights");
  await page.reload();
  await expect(page.getByText(/No purchases checked yet/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "By ingredient category" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Demo only/)).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Food: ₱0 of ₱500" }),
  ).toBeVisible();
});
