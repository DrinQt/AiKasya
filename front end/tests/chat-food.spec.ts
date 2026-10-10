import { clearInitialPlan } from "./helpers/plannerChat";
import { test, expect } from "@playwright/test";

test("Food shopping follow-ups keep the budget and remove claimed pantry stock", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/ingredients", (r) =>
    r.fulfill({
      json: [
        {
          ingredient_id: "rice",
          canonical_name: "Rice",
          aliases: [],
          base_unit: "g",
        },
      ],
    }),
  );
  await page.route("**/api/agent/interpret", (r) => {
    const message = r.request().postDataJSON().message as string;
    return r.fulfill({
      json: {
        intent: message.includes("100 budget") ? "plan_meal" : "buy_food",
        pantry_empty: message.includes("dont have"),
        budget_php: 100,
        servings: 3,
        meal_type: null,
        excluded_ingredients: [],
        max_prep_minutes: null,
        clarification_question: null,
        confidence_note: "Test",
      },
    });
  });
  await page.route("**/api/plans/generate", (r) => {
    const body = r.request().postDataJSON();
    requests.push(body);
    return r.fulfill({
      json: {
        status: body.basic_food ? "feasible" : "no_match",
        budget_php: 100,
        basic_food: body.basic_food,
        options: body.basic_food
          ? [
              {
                recipe_id: "basic_eggs",
                recipe_name: "Rice and boiled egg",
                servings: 3,
                estimated_total_php: 42,
                remaining_php: 58,
                items_to_buy: [
                  {
                    ingredient_id: "rice",
                    name: "Uncooked rice",
                    quantity: 500,
                    unit: "g",
                    cost_php: 20,
                  },
                ],
                pantry_items_used: [],
                warnings: [],
              },
            ]
          : [],
        reason_if_no_match:
          "The closest meal was 'Egg and tomato' needing an estimated PHP 103.47",
      },
    });
  });
  await page.goto("/#meals");
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await clearInitialPlan(page);
  requests.length = 0;
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("aikasya.v1")!);
    state.budget = 100;
    state.days = 1;
    state.pantry = [
      {
        id: "rice",
        name: "Rice",
        fil: "Bigas",
        quantity: "500 g",
        emoji: "🍚",
      },
    ];
    localStorage.setItem("aikasya.v1", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await clearInitialPlan(page);
  requests.length = 0;
  for (const message of [
    "100 budget ko para sa isang araw",
    "if theres no recipe, what food can i buy for 100 pesos so i can eat",
    "but i dont have foods in my pantry",
  ]) {
    await page.getByRole("textbox").fill(message);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect
      .poll(() => requests.length)
      .toBe(
        message.includes("100 budget")
          ? 1
          : message.includes("dont have")
            ? 3
            : 2,
      );
    await expect(
      page.getByText("Calculating locally...", { exact: true }),
    ).toHaveCount(0);
  }
  expect(requests[2]).toMatchObject({
    budget_php: 100,
    pantry: [],
    basic_food: true,
  });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("aikasya.v1")!),
  );
  expect(saved.days).toBe(1);
  expect(saved.pantry).toEqual([]);
  await expect(
    page.getByText(/You can buy basic ingredients/).last(),
  ).toBeVisible();
  await expect(
    page.getByText(/Use the pantry and grocery screens/),
  ).toHaveCount(0);
});
