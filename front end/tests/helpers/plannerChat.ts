import { expect, type Page } from "@playwright/test";
export async function clearInitialPlan(page: Page) {
  await expect(page.locator(".message.assistant")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear chat", exact: true }).click();
}
