import { test, expect } from "@playwright/test";

test("General food shopping sends an open basket and displays priced quantities and the final balance", async ({
  page,
}) => {
  let request: Record<string, unknown> | undefined;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/start")
      return route.fulfill({ json: { ready: true, message: "Ready" } });
    if (path === "/api/ingredients") return route.fulfill({ json: [] });
    if (path === "/api/agent/interpret")
      return route.fulfill({
        json: {
          intent: "buy_food",
          budget_php: 400,
          days: null,
          servings: null,
          shopping_items: [],
          excluded_ingredients: [],
          clarification_question: null,
        },
      });
    if (path === "/api/plans/generate") {
      request = route.request().postDataJSON();
      return route.fulfill({
        json: {
          status: "feasible",
          budget_php: 400,
          shopping_list: true,
          options: [
            {
              recipe_id: "shopping_basket",
              recipe_name: "Items to buy",
              estimated_total_php: 399.75,
              remaining_php: 0.25,
              warnings: [],
              pantry_items_used: [],
              items_to_buy: [
                {
                  ingredient_id: "rice",
                  name: "Rice",
                  quantity: 2,
                  unit: "kg",
                  cost_php: 120,
                },
                {
                  ingredient_id: "eggs",
                  name: "Eggs",
                  quantity: 15,
                  unit: "piece",
                  cost_php: 279.75,
                },
              ],
            },
          ],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/#chat");
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page
    .getByRole("textbox")
    .fill("i have 400 pesos budget for food, list items i can buy");
  await page.getByRole("button", { name: "Send message" }).click();
  const summary = page.getByRole("region", { name: "Shopping budget summary" });
  await expect(summary).toContainText("Planned purchases₱399.75");
  await expect(summary).toContainText("Budget left over₱0.25");
  await expect(
    page.getByText("Rice: 2 kg · PHP 120.00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Eggs: 15 piece · PHP 279.75", { exact: true }),
  ).toBeVisible();
  expect(request).toMatchObject({
    budget_php: 400,
    shopping_list: true,
    shopping_items: [],
  });
  await page.reload();
  await page
    .getByRole("radio", { name: "Shopping list of items", exact: true })
    .check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await expect(summary).toContainText("Budget left over₱0.25");
  await page
    .getByRole("button", {
      name: "Remove Rice from shopping list",
      exact: true,
    })
    .click();
  await expect(summary).toContainText("Budget left over₱120.25");
  await expect(summary).toContainText("Restored by removing items₱120.00");
  await expect(
    page.getByText("Rice: 2 kg · PHP 120.00", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("radio", { name: "Shopping list of items", exact: true })
    .check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await expect(summary).toContainText("Budget left over₱120.25");
});

test("A day's extra groceries are shown separately and deducted from its final balance", async ({
  page,
}) => {
  const extras = {
    recipe_id: "shopping_basket",
    recipe_name: "Extra groceries",
    servings: 1,
    estimated_total_php: 49.5,
    remaining_php: 0.5,
    warnings: [],
    pantry_items_used: [],
    items_to_buy: [
      {
        ingredient_id: "rice",
        name: "Rice",
        quantity: 750,
        unit: "g",
        cost_php: 49.5,
      },
    ],
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/start")
      return route.fulfill({ json: { ready: true, message: "Ready" } });
    if (path === "/api/ingredients") return route.fulfill({ json: [] });
    if (path === "/api/agent/interpret")
      return route.fulfill({
        json: {
          intent: "plan_meal",
          budget_php: 500,
          days: 1,
          servings: 1,
          excluded_ingredients: [],
          clarification_question: null,
        },
      });
    if (path === "/api/plans/generate")
      return route.fulfill({
        json: {
          status: "feasible",
          budget_php: 500,
          total_spent_php: 499.5,
          remaining_total_php: 0.5,
          options: [],
          schedule: [
            {
              day: 1,
              allocated_php: 500,
              spent_php: 499.5,
              remaining_php: 0.5,
              extra_groceries: extras,
              meals: ["breakfast", "lunch", "dinner"].map(
                (meal_type, index) => ({
                  meal_type,
                  cost_php: [100, 150, 200][index],
                  remaining_day_php: [400, 250, 50][index],
                  remaining_total_php: [400, 250, 50][index],
                  option: {
                    ...extras,
                    recipe_name: `${meal_type} meal`,
                    estimated_total_php: [100, 150, 200][index],
                    items_to_buy: [],
                  },
                }),
              ),
            },
          ],
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/#chat");
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page.getByRole("textbox").fill("500 pesos for 1 person for 1 day");
  await page.getByRole("button", { name: "Send message" }).click();
  const purchases = page.getByRole("article", { name: "Extra groceries" });
  await expect(purchases).toContainText("Rice: 750 g · ₱49.50");
  await expect(purchases.locator(".scheduled-balance")).toHaveText(
    "₱50.00 − ₱49.50 = ₱0.50",
  );
  await expect(
    page.getByRole("region", { name: "Plan budget summary" }),
  ).toContainText("Budget left over₱0.50");
  await expect(purchases.getByRole("button", { name: /Skip/ })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});
