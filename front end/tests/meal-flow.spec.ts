import { chooseNumber } from "./helpers/numberSheet";
import { test, expect } from "@playwright/test";

for (const purpose of ["Meal plan", "Shopping list of items"]) {
  test(`Home parameters and allergy check feed ${purpose}`, async ({
    page,
  }) => {
    const requests: Record<string, any>[] = [];
    await page.route("**/api/ingredients", (r) => r.fulfill({ json: [] }));
    await page.route("**/api/agent/interpret", (r) =>
      r.fulfill({
        json: {
          intent: "buy_food",
          budget_php: 600,
          servings: 2,
          meal_type: null,
          excluded_ingredients: [],
          shopping_items: [{ term: "egg", quantity: 3 }],
          max_prep_minutes: null,
          clarification_question: null,
          confidence_note: "Test",
        },
      }),
    );
    await page.route("**/api/recipes/egg", (r) =>
      r.fulfill({
        json: {
          recipe_id: "egg",
          name: "Egg meal",
          steps: ["Boil the eggs."],
          ingredients: [],
          base_servings: 2,
        },
      }),
    );
    await page.route("**/api/plans/generate", (r) => {
      const body = r.request().postDataJSON();
      requests.push(body);
      return r.fulfill({
        json: {
          status: "feasible",
          budget_php: body.budget_php,
          shopping_list: body.shopping_list,
          options: [
            {
              recipe_id: "egg",
              recipe_name: "Egg meal",
              servings: 2,
              estimated_total_php: 42,
              remaining_php: body.budget_php - 42,
              items_to_buy: [
                {
                  ingredient_id: "eggs",
                  name: "Egg",
                  quantity: 3,
                  unit: "piece",
                  cost_php: 42,
                },
              ],
              pantry_items_used: [],
              warnings: [],
            },
          ],
          reason_if_no_match: null,
        },
      });
    });
    await page.goto("/#home");
    await expect(
      page.getByRole("button", { name: "AI Chat", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Food budget (\u20b1)").fill("600");
    await chooseNumber(page, "Household size", "2");
    await chooseNumber(page, "Number of days", "3");
    await page.getByRole("button", { name: "Plan My Meals" }).click();
    await expect(page.getByText("PHP 600", { exact: false })).toBeVisible();
    await expect(page.locator(".chat-screen")).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await page.getByRole("checkbox", { name: "Peanuts", exact: true }).check();
    await page.getByRole("radio", { name: purpose, exact: true }).check();
    await page.getByRole("button", { name: "Continue with Kasya" }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatchObject({
      budget_php: 600,
      servings: 2,
      excluded_ingredient_ids: ["peanut"],
      shopping_list: purpose === "Shopping list of items",
    });
    await expect(
      page.getByText("Calculating locally...", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: /Describe a meal/ }),
    ).toBeVisible();
    if (purpose === "Shopping list of items") {
      await expect(
        page.getByRole("button", { name: "View Details" }),
      ).toHaveCount(0);
      await expect(page.getByText(/Egg: 3 piece/)).toBeVisible();
    }
    await page.getByRole("textbox").fill("Buy 3 pieces of eggs");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toMatchObject({
      budget_php: 600,
      shopping_list: true,
      shopping_items: [{ term: "egg", quantity: 3 }],
    });
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("aikasya.v1")!),
    );
    expect(saved).toMatchObject({ budget: 600, people: 2, days: 3 });
    await expect(
      page.getByText("Calculating locally...", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("textbox").fill("2000 budget for 10 people for 1 day");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect.poll(() => requests.length).toBe(3);
    expect(requests[2]).toMatchObject({ budget_php: 600, servings: 2 });
    const unchanged = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("aikasya.v1")!),
    );
    expect(unchanged).toMatchObject({ budget: 600, people: 2, days: 3 });
    expect(
      await page
        .locator(".chat-messages")
        .evaluate((el) => getComputedStyle(el).overflowY),
    ).toBe("visible");
    await page.screenshot({
      path: `screenshots/chat-${purpose.replaceAll(" ", "-")}.png`,
      fullPage: true,
    });
  });
}

test("Home validation and preference gate fit narrow mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/#home");
  await page.getByLabel("Food budget (\u20b1)").fill("0");
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await expect(page).toHaveURL(/#home$/);
  await page.getByLabel("Food budget (\u20b1)").fill("100");
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await expect(page.locator(".chat-screen")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
