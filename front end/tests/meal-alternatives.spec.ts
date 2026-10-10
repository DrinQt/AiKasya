import { test, expect } from "@playwright/test";

test("Choosing another meal uses the recalculated budget and preserves choice when skipping a meal", async ({
  page,
}) => {
  const requests: Record<string, any>[] = [];
  const option = {
    recipe_id: "original",
    recipe_name: "Original meal",
    servings: 1,
    estimated_total_php: 100,
    remaining_php: 400,
    items_to_buy: [],
    pantry_items_used: [],
    warnings: [],
    steps: ["Cook the food."],
  };
  const plan = (choice = false) => ({
    status: "feasible",
    budget_php: 500,
    options: [],
    total_spent_php: choice ? 350 : 300,
    remaining_total_php: choice ? 150 : 200,
    schedule: [
      {
        day: 1,
        allocated_php: 500,
        spent_php: choice ? 350 : 300,
        remaining_php: choice ? 150 : 200,
        meals: ["breakfast", "lunch", "dinner"].map((meal_type, index) => ({
          meal_type,
          cost_php: choice && index === 0 ? 150 : 100,
          remaining_day_php: 500 - (index + 1) * 100 - (choice ? 50 : 0),
          remaining_total_php: 500 - (index + 1) * 100 - (choice ? 50 : 0),
          option:
            choice && index === 0
              ? {
                  ...option,
                  recipe_id: "alternative",
                  recipe_name: "Tofu meal",
                  estimated_total_php: 150,
                }
              : option,
        })),
      },
    ],
  });
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
          servings: 1,
          days: 1,
          excluded_ingredients: [],
          clarification_question: null,
        },
      });
    if (path === "/api/plans/alternatives") {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          meal_alternatives: [
            {
              recipe_id: "alternative",
              recipe_name: "Tofu meal",
              cost_php: 150,
              plan: plan(true),
              meal_choices: [
                { day: 1, meal_type: "breakfast", recipe_id: "alternative" },
              ],
            },
          ],
        },
      });
    }
    if (path === "/api/plans/generate") {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: plan() });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/#chat");
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page.getByRole("textbox").fill("500 pesos for 1 person for 1 day");
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .getByRole("button", {
      name: "Other meals for breakfast on Day 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("group", { name: "Meal alternatives" })
    .getByRole("button", { name: /Tofu meal/ })
    .click();
  await expect(page.locator(".meal-schedule")).toHaveCount(2);
  const latest = page.locator(".meal-schedule").last();
  await expect(
    latest.getByRole("region", { name: "Plan budget summary" }),
  ).toContainText("Budget left over₱150.00");
  expect(requests[1]).toMatchObject({
    budget_php: 500,
    servings: 1,
    days: 1,
    target_day: 1,
    target_meal_type: "breakfast",
    exclude_recipe_id: "original",
  });
  await latest
    .getByRole("button", { name: "Skip lunch on Day 1", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2]).toMatchObject({
    meal_choices: [
      { day: 1, meal_type: "breakfast", recipe_id: "alternative" },
    ],
    skipped_meals: [{ day: 1, meal_type: "lunch" }],
  });
  await expect(page.locator(".meal-schedule")).toHaveCount(3);
  await page.getByRole("textbox").fill("Keep my meal choices");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3].meal_choices).toEqual([
    { day: 1, meal_type: "breakfast", recipe_id: "alternative" },
  ]);
});
