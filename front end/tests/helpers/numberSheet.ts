import { expect, type Page } from "@playwright/test";

export async function chooseNumber(page: Page, label: string, value: string) {
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: value, exact: true }).click();
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet).toHaveCount(0);
}
