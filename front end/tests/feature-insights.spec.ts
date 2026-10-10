import { test, expect } from "@playwright/test";

test("Meal recipes share cooking steps; switching features clears chat but keeps conclusions and resets persist", async ({
  page,
}) => {
  const requests: Record<string, any>[] = [];
  const interpretationRequests: Record<string, any>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/start")
      return route.fulfill({ json: { ready: true, message: "Ready" } });
    if (path === "/api/ingredients") return route.fulfill({ json: [] });
    if (path === "/api/agent/interpret") {
      const body = route.request().postDataJSON();
      interpretationRequests.push(body);
      return route.fulfill({
        json: {
          intent: body.message.includes("400") ? "buy_food" : "view_recipe",
          budget_php: body.message.includes("400") ? 400 : 500,
          servings: 1,
          days: 1,
          excluded_ingredients: [],
          shopping_items: [],
          clarification_question: null,
        },
      });
    }
    if (path === "/api/plans/generate") {
      const body = route.request().postDataJSON();
      requests.push(body);
      const option = {
        recipe_id: "egg",
        recipe_name: "Egg meal",
        servings: 1,
        estimated_total_php: 150,
        remaining_php: 350,
        items_to_buy: [
          {
            ingredient_id: "eggs",
            name: "Eggs",
            quantity: 3,
            unit: "piece",
            cost_php: 150,
          },
        ],
        pantry_items_used: [],
        warnings: [],
        steps: ["Boil water.", "Cook the egg for 8 minutes."],
      };
      return route.fulfill({
        json: body.shopping_list
          ? {
              status: "feasible",
              budget_php: 400,
              shopping_list: true,
              options: [
                { ...option, estimated_total_php: 399.75, remaining_php: 0.25 },
              ],
            }
          : {
              status: "feasible",
              budget_php: 500,
              total_spent_php: 450,
              remaining_total_php: 50,
              options: [],
              schedule: [
                {
                  day: 1,
                  allocated_php: 500,
                  spent_php: 450,
                  remaining_php: 50,
                  meals: ["breakfast", "lunch", "dinner"].map(
                    (meal_type, index) => ({
                      meal_type,
                      option,
                      cost_php: 150,
                      remaining_day_php: 500 - (index + 1) * 150,
                      remaining_total_php: 500 - (index + 1) * 150,
                    }),
                  ),
                },
              ],
            },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/#chat");
  await expect(
    page.locator(".planning-purpose").getByRole("radio"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("radio", { name: "Recipe with cooking steps" }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page
    .getByRole("textbox")
    .fill("500 pesos for 1 person for 1 day, show recipes");
  await page.getByRole("button", { name: "Send message" }).click();
  const breakfast = page
    .getByRole("tabpanel", { name: "Day 1", exact: true })
    .locator(".scheduled-meal")
    .first();
  await breakfast.getByText("Cooking steps", { exact: true }).click();
  await expect(
    breakfast.getByText("Cook the egg for 8 minutes."),
  ).toBeVisible();
  expect(requests[0]).toMatchObject({ meal_scope: "day", budget_php: 500 });
  await expect(
    page.getByRole("region", { name: "Plan budget summary" }),
  ).toContainText("Budget used90%");
  await page
    .getByRole("group", { name: "Chat feature" })
    .getByRole("button", { name: "Shopping list", exact: true })
    .click();
  await expect(page.locator(".chat-messages .message")).toHaveCount(0);
  await expect(page.getByText("Cook the egg for 8 minutes.")).toHaveCount(0);
  await page.getByRole("textbox").fill("400 pesos, list food I can buy");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("region", { name: "Shopping budget summary" }),
  ).toContainText("Budget left over₱0.25");
  expect(
    interpretationRequests.at(-1).existing_constraints.budget_php,
  ).toBeUndefined();
  expect(
    interpretationRequests.at(-1).existing_constraints.days,
  ).toBeUndefined();
  await expect(page.locator(".chat-messages .message")).toHaveCount(2);
  await page.getByRole("button", { name: "Add to Grocery List" }).click();
  await page.goto("/#insights");
  await expect(
    page.getByRole("region", { name: "Latest meal plan insights" }),
  ).toContainText("Budget left over₱50.00");
  await expect(
    page.getByRole("region", { name: "Latest shopping list insights" }),
  ).toContainText("Budget used99.94%");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Latest meal plan insights" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset insights", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Latest meal plan insights" }),
  ).toHaveCount(0);
  await page.reload();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("aikasya.v1")!),
  );
  expect(saved.planInsights).toEqual({});
  expect(saved.groceries.length).toBeGreaterThan(0);
  const oldPantry = saved.pantry;
  await page.goto("/#grocery");
  await expect(
    page.locator(".grocery-items input[type=checkbox]").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset grocery list", exact: true })
    .click();
  await page.reload();
  const afterReset = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("aikasya.v1")!),
  );
  expect(afterReset.groceries).toEqual([]);
  expect(afterReset.pantry).toEqual(oldPantry);
  expect(afterReset.budget).toBe(saved.budget);
});
