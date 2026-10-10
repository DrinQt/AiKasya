import { test, expect } from "@playwright/test";

test("Skip and restore a specific day's meal without losing budget or chat constraints", async ({
  page,
}) => {
  const requests: Record<string, any>[] = [];
  const interpretations: Record<string, any>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/start")
      return route.fulfill({ json: { ready: true, message: "Ready" } });
    if (path === "/api/ingredients") return route.fulfill({ json: [] });
    if (path === "/api/agent/interpret") {
      const request = route.request().postDataJSON();
      interpretations.push(request);
      return route.fulfill({
        json: {
          intent: "plan_meal",
          budget_php: 500,
          budget_basis: "per_day",
          servings: 1,
          days: 2,
          skipped_meals: request.existing_constraints.skipped_meals ?? [],
          excluded_ingredients: [],
          meal_type: null,
          max_prep_minutes: null,
          clarification_question: null,
        },
      });
    }
    if (path === "/api/plans/generate") {
      const request = route.request().postDataJSON();
      requests.push(request);
      let totalSpent = 0;
      const schedule = [1, 2].map((day) => {
        let remaining = 500;
        const meals = ["breakfast", "lunch", "dinner"].map(
          (meal_type, index) => {
            const skipped = request.skipped_meals.some(
              (meal: any) => meal.day === day && meal.meal_type === meal_type,
            );
            const cost = skipped ? 0 : [100, 150, 200][index];
            remaining -= cost;
            totalSpent += cost;
            return {
              meal_type,
              skipped,
              cost_php: cost,
              remaining_day_php: remaining,
              remaining_total_php: 1000 - totalSpent,
              reason: skipped
                ? "Skipped as requested. No budget deducted."
                : null,
              option: skipped
                ? null
                : {
                    recipe_id: "test",
                    recipe_name: `${meal_type} meal`,
                    servings: 1,
                    estimated_total_php: cost,
                    remaining_php: remaining,
                    items_to_buy: [],
                    pantry_items_used: [],
                    warnings: [],
                  },
            };
          },
        );
        return {
          day,
          allocated_php: 500,
          spent_php: 500 - remaining,
          remaining_php: remaining,
          meals,
        };
      });
      return route.fulfill({
        json: {
          status: "feasible",
          budget_php: 1000,
          total_spent_php: totalSpent,
          remaining_total_php: 1000 - totalSpent,
          options: [],
          reason_if_no_match: null,
          schedule,
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/#chat");
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page.getByRole("textbox").fill("500 per day for 1 person for 2 days");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("tab", { name: "Day 2", exact: true }).last().click();
  await page
    .getByRole("button", { name: "Skip breakfast on Day 2", exact: true })
    .click();
  await expect(page.locator(".meal-schedule")).toHaveCount(2);
  await page.getByRole("tab", { name: "Day 2", exact: true }).last().click();
  const day2 = page
    .getByRole("tabpanel", { name: "Day 2", exact: true })
    .last();
  await expect(day2.locator(".scheduled-meal").first()).toContainText(
    "Skipped · ₱0.00",
  );
  await expect(day2.locator(".scheduled-balance").first()).toHaveText(
    "₱500.00 − ₱0.00 = ₱500.00",
  );
  await expect(day2.locator(".scheduled-balance").nth(1)).toHaveText(
    "₱500.00 − ₱150.00 = ₱350.00",
  );
  await expect(day2.locator(".scheduled-balance").nth(2)).toHaveText(
    "₱350.00 − ₱200.00 = ₱150.00",
  );
  await expect(
    day2
      .locator(".scheduled-meal")
      .first()
      .getByRole("button", { name: "View Details" }),
  ).toHaveCount(0);
  expect(requests[1]).toMatchObject({
    days: 2,
    budget_php: 500,
    skipped_meals: [{ day: 2, meal_type: "breakfast" }],
  });
  await expect(
    page.getByRole("region", { name: "Plan budget summary" }).last(),
  ).toContainText("Budget left over₱200.00");
  await page.getByRole("textbox").fill("Dinner within 20 minutes");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(page.locator(".meal-schedule")).toHaveCount(3);
  await page.getByRole("tab", { name: "Day 2", exact: true }).last().click();
  expect(interpretations.at(-1).existing_constraints.skipped_meals).toEqual([
    { day: 2, meal_type: "breakfast" },
  ]);
  await expect(day2.locator(".scheduled-balance").first()).toHaveText(
    "₱500.00 − ₱0.00 = ₱500.00",
  );
  await page.reload();
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page.getByRole("tab", { name: "Day 2", exact: true }).last().click();
  await expect(day2.locator(".scheduled-balance").first()).toHaveText(
    "₱500.00 − ₱0.00 = ₱500.00",
  );
  expect(requests).toHaveLength(3);
  await page
    .getByRole("button", { name: "Include breakfast on Day 2", exact: true })
    .last()
    .click();
  await expect(page.locator(".meal-schedule")).toHaveCount(4);
  await page.getByRole("tab", { name: "Day 2", exact: true }).last().click();
  await expect(day2.locator(".scheduled-balance").first()).toHaveText(
    "₱500.00 − ₱100.00 = ₱400.00",
  );
  expect(requests.at(-1).skipped_meals).toEqual([]);
  await expect(day2.locator(".scheduled-balance").nth(2)).toHaveText(
    "₱250.00 − ₱200.00 = ₱50.00",
  );
});

for (const days of [2, 30]) {
  test(`${days}-day plan uses accessible day tabs and a final budget conclusion`, async ({
    page,
  }) => {
    const requests: Record<string, unknown>[] = [];
    const schedule = Array.from({ length: days }, (_, index) => index + 1).map(
      (day) => ({
        day,
        allocated_php: 500,
        spent_php: 450,
        remaining_php: 50,
        meals: ["breakfast", "lunch", "dinner"].map((meal_type, index) => ({
          meal_type,
          cost_php: [100, 150, 200][index],
          remaining_day_php: [400, 250, 50][index],
          remaining_total_php:
            days * 500 - [100, 250, 450][index] - (day - 1) * 450,
          reason: null,
          option: {
            recipe_id: "egg_meal",
            recipe_name: `${meal_type} meal`,
            servings: 1,
            estimated_total_php: [100, 150, 200][index],
            remaining_php: [400, 250, 50][index],
            items_to_buy: [],
            pantry_items_used: [],
            warnings: [],
          },
        })),
      }),
    );
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/agent/start")
        return route.fulfill({
          json: { ready: true, message: "Ollama ready" },
        });
      if (path === "/api/agent/interpret")
        return route.fulfill({
          json: {
            intent: "plan_meal",
            budget_php: 500,
            budget_basis: "per_day",
            servings: 1,
            days,
            excluded_ingredients: [],
            meal_type: null,
            max_prep_minutes: null,
            clarification_question: null,
          },
        });
      if (path === "/api/ingredients") return route.fulfill({ json: [] });
      if (path === "/api/plans/generate") {
        requests.push(route.request().postDataJSON());
        return route.fulfill({
          json: {
            status: "feasible",
            budget_php: days * 500,
            total_spent_php: days * 450,
            remaining_total_php: days * 50,
            options: [],
            reason_if_no_match: null,
            schedule,
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/#chat");
    await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
    await page.getByRole("button", { name: "Continue with Kasya" }).click();
    await page
      .getByRole("textbox")
      .fill(`500 per day for 1 person for ${days} days`);
    await page.getByRole("button", { name: "Send message" }).click();
    const day1 = page.getByRole("tabpanel", { name: "Day 1", exact: true });
    await expect(day1).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Day 2", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(days);
    await expect(page.locator(".scheduled-meal")).toHaveCount(3);
    await expect(
      day1.getByRole("heading", { name: "Breakfast", exact: true }),
    ).toBeVisible();
    await expect(day1.locator(".scheduled-balance").first()).toHaveText(
      "₱500.00 − ₱100.00 = ₱400.00",
    );
    await expect(day1.locator(".scheduled-balance").nth(1)).toHaveText(
      "₱400.00 − ₱150.00 = ₱250.00",
    );
    await expect(day1.locator(".scheduled-balance").nth(2)).toHaveText(
      "₱250.00 − ₱200.00 = ₱50.00",
    );
    expect(requests[0]).toMatchObject({
      budget_php: 500,
      budget_basis: "per_day",
      days,
      servings: 1,
      meal_scope: "day",
    });
    const conclusion = page.getByRole("region", {
      name: "Plan budget summary",
    });
    await expect(conclusion).toContainText(
      `Budget left over₱${(days * 50).toFixed(2)}`,
    );
    await expect(conclusion).toContainText(`across ${days} days`);
    const firstTab = page.getByRole("tab", { name: "Day 1", exact: true });
    await firstTab.click();
    await firstTab.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Day 2", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("tabpanel", { name: "Day 2", exact: true }),
    ).toBeVisible();
    await expect(day1).toHaveCount(0);
    await page.getByRole("tab", { name: "Day 2", exact: true }).press("End");
    await expect(
      page.getByRole("tab", { name: `Day ${days}`, exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("tabpanel", { name: `Day ${days}`, exact: true }),
    ).toBeVisible();
    await expect(conclusion).toContainText(
      `Budget left over₱${(days * 50).toFixed(2)}`,
    );
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 720 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await page
      .getByRole("tab", { name: `Day ${days}`, exact: true })
      .press("Home");
    await page.setViewportSize({ width: 320, height: 720 });
    await page
      .locator(".meal-schedule")
      .screenshot({ path: `screenshots/daily-meal-tabs-${days}-320.png` });
    await page.reload();
    await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
    await page.getByRole("button", { name: "Continue with Kasya" }).click();
    await expect(day1.locator(".scheduled-balance").first()).toHaveText(
      "₱500.00 − ₱100.00 = ₱400.00",
    );
    expect(requests).toHaveLength(1);
  });
}
