import { test, expect, type Page } from "@playwright/test";
const ingredients = [
  {
    ingredient_id: "egg",
    canonical_name: "Egg",
    aliases: ["eggs"],
    base_unit: "piece",
  },
];
const option = {
  recipe_id: "egg_meal",
  recipe_name: "Egg meal",
  servings: 3,
  prep_minutes: 5,
  cook_minutes: 10,
  estimated_total_php: 42,
  remaining_php: 124.67,
  items_to_buy: [
    {
      ingredient_id: "egg",
      name: "Egg",
      quantity: 3,
      unit: "piece",
      cost_php: 42,
      price_source_type: "user_entered",
      price_observed_at: "2026-10-10",
    },
  ],
  pantry_items_used: [],
  warnings: [],
};
const plan = {
  status: "feasible",
  budget_php: 500 / 3,
  options: [option],
  reason_if_no_match: null,
};
const recipe = {
  recipe_id: "egg_meal",
  name: "Egg meal",
  base_servings: 3,
  prep_minutes: 5,
  cook_minutes: 10,
  steps: ["Cook the eggs."],
  ingredients: [
    { ingredient_id: "egg", name: "Egg", quantity: 3, unit: "piece" },
  ],
  source_title: "Test recipe",
  source_url_or_note: "Local collection",
};
async function mockBackend(page: Page) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === "/api/ingredients"
        ? ingredients
        : path === "/api/plans/generate"
          ? plan
          : path.startsWith("/api/recipes/")
            ? recipe
            : path === "/api/agent/interpret"
              ? {
                  intent: "plan_meal",
                  budget_php: 150,
                  servings: 3,
                  meal_type: "dinner",
                  excluded_ingredients: [],
                  max_prep_minutes: null,
                  clarification_question: null,
                  confidence_note: "Interpreted by the local parser.",
                }
              : path === "/api/pantry"
                ? [
                    {
                      ingredient_id: "egg",
                      name: "Egg",
                      quantity: 6,
                      unit: "piece",
                    },
                  ]
                : {};
    return route.fulfill({
      json: body,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
}
test("Local planner uses household constraints, opens real instructions, and adds calculated groceries", async ({
  page,
}) => {
  await mockBackend(page);
  const request = page.waitForRequest((request) =>
    request.url().endsWith("/api/plans/generate"),
  );
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  const body = (await request).postDataJSON();
  expect(body.budget_php).toBeCloseTo(500 / 3);
  expect(body.servings).toBe(3);
  expect(body.meal_scope).toBe("single_meal");
  await expect(page.getByRole("heading", { name: "Egg meal" })).toBeVisible();
  await page.getByRole("button", { name: "View Details" }).click();
  await expect(page.getByText("Cook the eggs.")).toBeVisible();
  await page.getByRole("button", { name: "Add to Grocery List" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Egg (3 piece)" }),
  ).toBeVisible();
  await expect(page.getByText("₱42", { exact: true })).toBeVisible();
});
test("Chat uses Home constraints even when interpretation supplies a different budget", async ({
  page,
}) => {
  await mockBackend(page);
  await page.getByRole("button", { name: "AI Chat", exact: true }).click();
  const request = page.waitForRequest((request) =>
    request.url().endsWith("/api/plans/generate"),
  );
  await page
    .getByRole("textbox")
    .fill("Plan dinner for 150 pesos for 3 people");
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await request).postDataJSON().budget_php).toBeCloseTo(500 / 3);
  await expect(page.getByRole("heading", { name: "Egg meal" })).toBeVisible();
  await page.getByRole("button", { name: "View Details" }).click();
  await expect(page.getByText("Cook the eggs.")).toBeVisible();
});
test("No-match response remains a no-match rather than showing sample meals", async ({
  page,
}) => {
  await mockBackend(page);
  await page.route("**/api/plans/generate", (route) =>
    route.fulfill({
      json: {
        status: "no_match",
        budget_php: 1,
        options: [],
        reason_if_no_match: "No meal fits this budget.",
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await expect(page.getByText("No meal fits this budget.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Adobo/ })).toHaveCount(0);
});
test("Pantry loads backend stock and grocery prices are normalized with their actual quantity", async ({
  page,
}) => {
  await mockBackend(page);
  await page.getByRole("button", { name: "Pantry Check", exact: true }).click();
  await page.getByRole("button", { name: "Load backend pantry" }).click();
  await expect(
    page.getByRole("heading", { name: "Egg", exact: true }),
  ).toBeVisible();
  const pantry = page.waitForRequest((request) =>
    request.url().endsWith("/api/pantry/upsert"),
  );
  await page.getByRole("button", { name: "Save pantry to backend" }).click();
  expect((await pantry).postDataJSON()).toEqual({
    ingredient_id: "egg",
    quantity: 6,
    unit: "piece",
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meals", exact: true })
    .click();
  await page.getByRole("button", { name: "Add to Grocery List" }).click();
  const price = page.waitForRequest((request) =>
    request.url().endsWith("/api/prices/upsert"),
  );
  await page.getByRole("button", { name: "Save prices to backend" }).click();
  expect((await price).postDataJSON()).toMatchObject({
    ingredient_id: "egg",
    amount_php: 42,
    quantity: 3,
    unit: "piece",
    source_type: "user_entered",
  });
});

test("Chat gives a concise budget shortfall and a working budget suggestion", async ({
  page,
}) => {
  await mockBackend(page);
  await page.getByRole("button", { name: "₱500 My Budget" }).click();
  await page.getByLabel("Food budget (₱)").fill("100");
  await page.getByLabel("Number of days").fill("1");
  await page.getByRole("button", { name: "Save Budget" }).click();
  await page.route("**/api/agent/interpret", (route) =>
    route.fulfill({
      json: {
        intent: "plan_meal",
        budget_php: 100,
        servings: 3,
        meal_type: "dinner",
        excluded_ingredients: [],
        max_prep_minutes: null,
        clarification_question: null,
        confidence_note:
          "Interpreted on-device via local parser; verified local execution.",
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  let attempts = 0;
  await page.route("**/api/plans/generate", (route) => {
    attempts++;
    return route.fulfill({
      json:
        attempts === 1
          ? {
              status: "no_match",
              budget_php: 100,
              options: [],
              reason_if_no_match:
                "No recipe in the local library meets all constraints within ₱100.00. The closest meal was 'Tortang Talong' needing an estimated ₱107.00 (₱7.00 over budget). Try increasing budget.",
            }
          : plan,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.getByRole("button", { name: "AI Chat", exact: true }).click();
  await page.getByRole("textbox").fill("100 pesos for 3 people");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Tortang Talong costs.*add/)).toBeVisible();
  await expect(page.getByText(/verified local execution/)).toHaveCount(0);
  const request = page.waitForRequest((request) =>
    request.url().endsWith("/api/plans/generate"),
  );
  await page.getByRole("button", { name: "Use PHP 107 budget" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    budget_php: 107,
    servings: 3,
  });
  await expect(page.getByRole("heading", { name: "Egg meal" })).toBeVisible();
  await page.getByRole("button", { name: "Close chat" }).click();
  await expect(
    page.getByRole("button", { name: "₱107 My Budget" }),
  ).toBeVisible();
});

test("Updated Home people and days are used in the next chat request", async ({ page }) => {
  await mockBackend(page);
  await page.getByRole("combobox", { name: "Household size" }).selectOption("2");
  await page.getByRole("combobox", { name: "Number of days" }).selectOption("2");
  await page.getByRole("button", { name: "AI Chat", exact: true }).click();
  await page.getByRole("textbox").fill("100 pesos for 8 people");
  const request = page.waitForRequest(request => request.url().endsWith("/api/plans/generate"));
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await request).postDataJSON()).toMatchObject({ budget_php: 250, servings: 2 });
});