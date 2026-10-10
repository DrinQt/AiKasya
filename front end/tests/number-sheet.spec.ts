import { test, expect } from "@playwright/test";
import { chooseNumber } from "./helpers/numberSheet";

test("Only Done commits a choice; all dismiss methods restore focus and scrolling", async ({
  page,
}) => {
  await page.goto("/#home");
  const people = page.getByRole("button", { name: /^Household size:/ });
  const oldOverflow = await page.evaluate(() => document.body.style.overflow);
  for (const dismiss of ["Cancel", "Close selection", "Escape", "outside"]) {
    await people.click();
    const sheet = page.getByRole("dialog", { name: "How many people?" });
    await expect(sheet.getByRole("radio")).toHaveCount(20);
    await expect(
      sheet.getByRole("radio", { name: "3", exact: true }),
    ).toBeFocused();
    expect(await page.evaluate(() => document.body.style.position)).toBe(
      "fixed",
    );
    await sheet.getByRole("radio", { name: "5", exact: true }).click();
    await expect(people).toHaveAttribute("data-value", "3");
    if (dismiss === "Escape") await page.keyboard.press("Escape");
    else if (dismiss === "outside") await page.mouse.click(10, 10);
    else
      await sheet.getByRole("button", { name: dismiss, exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(people).toBeFocused();
    await expect(people).toHaveAttribute("data-value", "3");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      oldOverflow,
    );
  }
  await chooseNumber(page, "Household size", "20");
  await expect(people).toHaveAttribute("data-value", "20");
  await page.reload();
  await expect(people).toHaveAttribute("data-value", "20");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("aikasya.v1")!).people,
    ),
  ).toBe(20);
});

test("Keyboard navigation remains trapped in the sheet and confirms through Done", async ({
  page,
}) => {
  await page.goto("/#home");
  await page.getByRole("button", { name: /^Number of days:/ }).click();
  const sheet = page.getByRole("dialog");
  await page.keyboard.press("ArrowRight");
  await expect(
    sheet.getByRole("radio", { name: "4", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("End");
  await expect(
    sheet.getByRole("radio", { name: "30", exact: true }),
  ).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(
      await sheet.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Number of days:/ }),
  ).toHaveAttribute("data-value", "30");
});

for (const width of [320, 375, 390, 430]) {
  test(`Bottom sheet fits ${width}px and a short mobile viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto("/#home");
    await page.getByRole("button", { name: /^Number of days:/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("radio")).toHaveCount(30);
    await expect(
      sheet.getByRole("radio", { name: "31", exact: true }),
    ).toHaveCount(0);
    await expect(
      sheet.getByRole("button", { name: "Done", exact: true }),
    ).toBeInViewport();
    const bounds = await sheet.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    await sheet.getByRole("radio", { name: "30", exact: true }).click();
    await page.screenshot({ path: `screenshots/number-sheet-${width}.png` });
    await sheet.getByRole("button", { name: "Done", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Number of days:/ }),
    ).toHaveAttribute("data-value", "30");
  });
}
