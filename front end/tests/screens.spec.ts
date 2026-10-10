import { chooseNumber } from "./helpers/numberSheet";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
});
test("Settings switches English and Filipino and persists language", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page.getByRole("button", { name: "Language English" }).click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fil");
  await expect(
    page.getByRole("button", { name: "Tahanan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tahanan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Magplano ng Pagkain" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".budget-card input")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
});
test("Insights reflects checked grocery spending", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Food: ₱160 of ₱500" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Sample weekly spending" }),
  ).toBeVisible();
});
test("Pantry adds and removes items across reloads", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.getByRole("button", { name: "Pantry Check", exact: true }).click();
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  await page.getByLabel("Item name").fill("Carrots");
  await page.getByLabel("Quantity").fill("3 pcs");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Carrots", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My Pantry", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Carrots", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove item — Carrots" }).click();
  await expect(
    page.getByRole("heading", { name: "Carrots", exact: true }),
  ).toHaveCount(0);
});
test("Grocery checks and editable prices persist; market calculates spending", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.getByRole("button", { name: "Grocery List", exact: true }).click();
  await page.getByRole("checkbox", { name: "Vegetables (1 bunch)" }).check();
  await page.getByRole("button", { name: "Edit Prices" }).click();
  await page.getByRole("spinbutton", { name: "Price — Pork" }).fill("150");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("₱245", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Grocery List", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Vegetables (1 bunch)" }),
  ).toBeChecked();
  await expect(page.getByText("₱150", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Market Mode" }).click();
  await expect(
    page.getByRole("heading", { name: "Market Mode" }),
  ).toBeVisible();
  await expect(page.getByText("₱210", { exact: true })).toBeVisible();
});
test("Meal planner requires confirmed inputs and reports unavailable backend", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.goto("/#budget");
  await page.getByLabel("Food budget (₱)").fill("300");
  await chooseNumber(page, "Household size", "2");
  await chooseNumber(page, "Number of days", "2");
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();

  await expect(
    page.getByText(
      "Could not reach the local backend. Start the backend and try again.",
    ),
  ).toBeVisible();
});
test("AI Chat reports backend unavailability and supports clearing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.goto("/#chat");
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();
  await page
    .getByRole("textbox", { name: /Describe a meal or food preference/ })
    .fill("Plan meals for ₱300");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Plan meals for ₱300", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Could not reach the local backend. Start the backend and try again.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(page.getByText("Start a new conversation.")).toBeVisible();
});
test("Welcome uses official assets and starts the dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your Offline AI Food Budget Buddy" }),
  ).toBeVisible();
  expect(
    await page
      .locator("img")
      .evaluateAll((imgs) =>
        imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0),
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "Get Started" }).click();
  await expect(page.getByRole("heading", { name: "Hello!" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hello!" })).toBeVisible();
});
test("Dashboard budget inputs update and persist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.goto("/#budget");
  await page.getByLabel("Food budget (₱)").fill("300");
  await chooseNumber(page, "Household size", "2");
  await chooseNumber(page, "Number of days", "2");
  await page.getByRole("button", { name: "Save Preferences" }).click();
  await expect(page.locator(".budget-card input")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Household size:/ }),
  ).toHaveAttribute("data-value", "2");
  await page.reload();
  await expect(page.locator(".budget-card input")).toBeVisible();
});
test("Welcome and dashboard fit narrow mobile through desktop", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (await page.getByRole("button", { name: "Get Started" }).isVisible())
      await page.getByRole("button", { name: "Get Started" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("Home sends users to the allergy and purpose check before chat", async ({
  page,
}) => {
  await page.goto("/#home");
  await expect(
    page.getByRole("button", { name: "AI Chat", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Plan My Meals", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Meal plan", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("Dashboard household controls save directly and prefill planning inputs", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await chooseNumber(page, "Household size", "2");
  await chooseNumber(page, "Number of days", "2");
  await expect(page).toHaveURL(/#home$/);
  await expect(page.locator(".budget-card input")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Household size:/ }),
  ).toHaveAttribute("data-value", "2");
  await expect(
    page.getByRole("button", { name: /^Number of days:/ }),
  ).toHaveAttribute("data-value", "2");
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await page.getByRole("radio", { name: "Meal plan", exact: true }).check();
  await page.getByRole("button", { name: "Continue with Kasya" }).click();

  await expect(
    page.getByText(
      "Could not reach the local backend. Start the backend and try again.",
    ),
  ).toBeVisible();
});
