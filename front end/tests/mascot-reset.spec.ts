import { test, expect } from "@playwright/test";

test("Transparent mascot opens chat and Insights reset starts a persistent tracking period", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  const mascot = page.getByRole("button", {
    name: "Chat with Kasya",
    exact: true,
  });
  await expect(mascot.getByRole("img")).toHaveAttribute(
    "src",
    "/assets/aikasya-mascot-transparent.png",
  );
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(mascot).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await mascot.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".planning-purpose")).toBeVisible();
  await page.goto("/#insights");
  await expect(
    page.getByRole("img", { name: "Food: ₱160 of ₱500" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset insights", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Food: ₱0 of ₱500" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Food: ₱0 of ₱500" }),
  ).toBeVisible();
  await page.goto("/#grocery");
  const checked = page.getByRole("checkbox", { name: "Pork (300g)" });
  await expect(checked).toBeChecked();
  await checked.uncheck();
  await checked.check();
  await page.goto("/#insights");
  await expect(
    page.getByRole("img", { name: "Food: ₱120 of ₱500" }),
  ).toBeVisible();
  await page.goto("/#grocery");
  await page.getByRole("button", { name: "Remove Pork", exact: true }).click();
  await page.goto("/#insights");
  await expect(
    page.getByRole("img", { name: "Food: ₱0 of ₱500" }),
  ).toBeVisible();
});
