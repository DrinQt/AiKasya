import { test, expect } from "@playwright/test";

test("Chat starts Ollama and waits before planning or sending", async ({
  page,
}) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let starts = 0;
  let plans = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/start") {
      starts++;
      expect(route.request().method()).toBe("POST");
      await wait;
      return route.fulfill({
        json: { ready: true, message: "Ollama is ready with llama3.2:3b." },
      });
    }
    if (path === "/api/plans/generate") plans++;
    return route.fulfill({
      json:
        path === "/api/ingredients"
          ? []
          : {
              status: "no_match",
              budget_php: 166.66,
              options: [],
              reason_if_no_match: "No match",
            },
    });
  });
  await page.goto("/#home");
  expect(starts).toBe(0);
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await expect(
    page.getByText("Starting Ollama…", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox").fill("Dinner please");
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeDisabled();
  expect(plans).toBe(0);
  release();
  await expect(
    page.getByText("Ollama is ready with llama3.2:3b."),
  ).toBeVisible();
  await expect.poll(() => plans).toBe(1);
});

test("Missing Ollama is shown honestly and can be retried", async ({
  page,
}) => {
  let starts = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/start") {
      starts++;
      return route.fulfill({
        json:
          starts === 1
            ? {
                ready: false,
                message: "Ollama is not installed or could not be found.",
              }
            : { ready: true, message: "Ollama is ready with llama3.2:3b." },
      });
    }
    return route.fulfill({
      json:
        path === "/api/ingredients"
          ? []
          : {
              status: "no_match",
              budget_php: 166.66,
              options: [],
              reason_if_no_match: "No match",
            },
    });
  });
  await page.goto("/#chat");
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await expect(
    page.getByText("Ollama is not installed or could not be found."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Ollama is ready with llama3.2:3b."),
  ).toBeVisible();
  expect(starts).toBe(2);
});
