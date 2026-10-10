import { test, expect } from "@playwright/test";

test("Saved allergies and chat exclusions reach the local planner together", async ({
  page,
}) => {
  await page.route("**/api/ingredients", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/plans/generate", (route) =>
    route.fulfill({
      json: {
        status: "no_match",
        budget_php: 500,
        options: [],
        reason_if_no_match: "No matching meals.",
      },
    }),
  );
  await page.route("**/api/agent/interpret", (route) =>
    route.fulfill({
      json: {
        intent: "plan_meal",
        budget_php: 500,
        servings: 3,
        meal_type: "dinner",
        excluded_ingredients: ["fish"],
        max_prep_minutes: null,
        clarification_question: null,
        confidence_note: "Local parser",
      },
    }),
  );
  await page.goto("/#budget");
  await page.getByRole("checkbox", { name: "Peanuts", exact: true }).check();
  await page.getByRole("checkbox", { name: "Eggs", exact: true }).check();
  await page.getByRole("button", { name: "Save Preferences" }).click();
  const mealRequest = page.waitForRequest((r) =>
    r.url().endsWith("/api/plans/generate"),
  );
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  expect((await mealRequest).postDataJSON().excluded_ingredient_ids).toEqual([
    "peanut",
    "egg",
  ]);
  await page.goto("/#home");
  await page.getByRole("button", { name: "AI Chat", exact: true }).click();
  await page.getByRole("textbox").fill("Plan dinner without fish");
  const chatRequest = page.waitForRequest((r) =>
    r.url().endsWith("/api/plans/generate"),
  );
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await chatRequest).postDataJSON().excluded_ingredient_ids).toEqual([
    "peanut",
    "egg",
    "fish",
  ]);
});

test("Allergy resolution failures do not show an unfiltered sample plan", async ({
  page,
}) => {
  await page.route("**/api/ingredients", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/plans/generate", (route) =>
    route.fulfill({
      status: 422,
      json: {
        detail:
          "Please clarify these allergies/exclusions so we can keep you safe: Kiwi.",
      },
    }),
  );
  await page.goto("/#budget");
  await page.getByRole("checkbox", { name: "Other", exact: true }).check();
  await page.getByLabel("Custom ingredient", { exact: true }).fill("Kiwi");
  await page.getByRole("button", { name: "Add custom allergen" }).click();
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await expect(page.getByRole("status")).toContainText("Please clarify");
  await expect(
    page.getByRole("button", { name: "Add to Grocery List" }),
  ).toHaveCount(0);
});

test("Household allergens and custom ingredients save and restore", async ({
  page,
}) => {
  await page.goto("/#budget");
  await expect(
    page.getByRole("radio", { name: "Unknown / Not sure", exact: true }),
  ).toBeChecked();
  await page.getByRole("checkbox", { name: "Peanuts", exact: true }).check();
  await page.getByRole("checkbox", { name: "Eggs", exact: true }).check();
  await expect(
    page.getByRole("radio", { name: "Unknown / Not sure", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Other", exact: true }).check();
  await page.getByLabel("Custom ingredient", { exact: true }).fill(" Kiwi ");
  await page.getByRole("button", { name: "Add custom allergen" }).click();
  await page.getByLabel("Custom ingredient", { exact: true }).fill("kiwi");
  await page.getByRole("button", { name: "Add custom allergen" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This ingredient is already selected.",
  );
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page).toHaveURL(/#home$/);
  await page.reload();
  await page.goto("/#budget");
  await expect(
    page.getByRole("checkbox", { name: "Peanuts", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Eggs", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Remove item — Kiwi" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove item — Kiwi" }).click();
  await page.getByRole("checkbox", { name: "Other", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await page.goto("/#budget");
  await expect(
    page.getByRole("checkbox", { name: "Other", exact: true }),
  ).not.toBeChecked();
});

test("No allergies and unknown remain exclusive with restrictions", async ({
  page,
}) => {
  await page.goto("/#budget");
  await page.getByRole("checkbox", { name: "Fish", exact: true }).check();
  await page
    .getByRole("radio", { name: "No known allergies", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Fish", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await page.goto("/#budget");
  await expect(
    page.getByRole("radio", { name: "No known allergies", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("radio", { name: "Unknown / Not sure", exact: true })
    .check();
  await page.getByRole("button", { name: "Save Preferences" }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("aikasya.v1")!).allergies,
    ),
  ).toEqual({ status: "unknown", allergens: [], custom: [], other: false });
  await page.goto("/#budget");
  await page.getByRole("checkbox", { name: "Other", exact: true }).check();
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Add a custom ingredient or deselect Other.",
  );
  await expect(page).toHaveURL(/#budget$/);
});
