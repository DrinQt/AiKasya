import { test, expect } from "@playwright/test";

test("Casual chat collects typed details, accepts budget changes, and preserves Home", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  const interpretations: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/start")
      return route.fulfill({ json: { ready: true, message: "Ollama ready" } });
    if (path === "/api/ingredients") return route.fulfill({ json: [] });
    if (path === "/api/agent/interpret") {
      const body = route.request().postDataJSON();
      interpretations.push(body.existing_constraints);
      const previous = body.existing_constraints;
      const budget = body.message.includes("300")
        ? 300
        : body.message.includes("200")
          ? 200
          : previous.budget_php;
      const people = body.message === "just me" ? 1 : previous.servings;
      const days = body.message.includes("1 day") ? 1 : previous.days;
      return route.fulfill({
        json: {
          intent: "plan_meal",
          budget_php: budget ?? null,
          servings: people ?? null,
          days: days ?? null,
          excluded_ingredients: [],
          meal_type: "dinner",
          max_prep_minutes: null,
          clarification_question: people ? null : "How many people?",
          confidence_note: "Test interpretation",
        },
      });
    }
    if (path === "/api/plans/generate") {
      const body = route.request().postDataJSON();
      requests.push(body);
      return route.fulfill({
        json: {
          status: "no_match",
          budget_php: body.budget_php,
          options: [],
          reason_if_no_match: `No matching meals within PHP ${body.budget_php}.`,
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/#home");
  await page
    .getByRole("button", { name: "Chat with Kasya", exact: true })
    .click();
  await expect(
    page.getByText("I'll use the details you set on Home."),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await expect(
    page.getByRole("region", { name: "Home planning details" }),
  ).toHaveCount(0);
  await page.getByRole("textbox").fill("200 budget for 1 day");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("How many people?", { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(0);
  expect(interpretations[0]).not.toHaveProperty("budget_php");
  expect(interpretations[0]).not.toHaveProperty("servings");
  expect(interpretations[0]).not.toHaveProperty("days");
  await page.getByRole("textbox").fill("just me");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("No matching meals within PHP 200.", { exact: true }),
  ).toBeVisible();
  expect(requests[0]).toMatchObject({ budget_php: 200, servings: 1 });
  await page.getByRole("textbox").fill("what if my budget is 300");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("No matching meals within PHP 300.", { exact: true }),
  ).toBeVisible();
  expect(requests[1]).toMatchObject({ budget_php: 300, servings: 1 });
  await page.goto("/#home");
  await page.reload();
  await expect(page.locator(".budget-card input")).toHaveValue("500");
  await expect(
    page.getByRole("button", { name: "Household size: 3" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chat with Kasya" }).click();
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page.getByRole("textbox").fill("Dinner please");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(interpretations[3]).toMatchObject({
    budget_php: 300,
    servings: 1,
    days: 1,
  });
});
