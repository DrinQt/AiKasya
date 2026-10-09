import { test, expect } from "@playwright/test";
test("Settings switches English and Filipino and persists language", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Language English" }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("fil");
  await expect(
    page.getByRole("button", { name: "Tahanan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tahanan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Magplano ng Pagkain" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "₱500 Aking Badyet" }),
  ).toBeVisible();
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
  await expect(page.getByRole("heading", {name:"My Pantry",exact:true})).toBeVisible();
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
  await expect(page.getByRole("heading", {name:"Grocery List",exact:true})).toBeVisible();
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
test("Meal planner uses household inputs and opens recipe details", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.getByRole("button", { name: "₱500 My Budget" }).click();
  await page.getByLabel("Food budget (₱)").fill("300");
  await page.getByLabel("Household size").fill("2");
  await page.getByLabel("Number of days").fill("2");
  await page.getByRole("button", { name: "Save Budget" }).click();
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await expect(page.getByText("₱295", { exact: true })).toBeVisible();
  await expect(page.getByText("Within budget!")).toBeVisible();
  await page.getByRole("button", { name: /Adobo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Recipe Details" }),
  ).toBeVisible();
});
test("AI Chat responds with a mock plan and supports clearing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.getByRole("button", { name: "AI Chat", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Ask me anything…" })
    .fill("Plan meals for ₱300");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByText("Plan meals for ₱300", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Details" }),
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
  await page.getByRole("button", { name: "₱500 My Budget" }).click();
  await page.getByLabel("Food budget (₱)").fill("300");
  await page.getByLabel("Household size").fill("2");
  await page.getByLabel("Number of days").fill("2");
  await page.getByRole("button", { name: "Save Budget" }).click();
  await expect(
    page.getByRole("button", { name: "₱300 My Budget" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Household size" })).toHaveValue("2");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "₱300 My Budget" }),
  ).toBeVisible();
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

test("Floating mascot opens chat without leaving the page and restores focus", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await expect(page.getByRole("navigation").getByRole("button", { name: "AI Chat" })).toHaveCount(0);
  const launcher = page.getByRole("button", { name: "AI Chat", exact: true });
  await launcher.click();
  const chat = page.getByRole("dialog", { name: "AI Chat" });
  await expect(chat).toBeVisible();
  await expect(chat.getByRole("textbox")).toBeFocused();
  await expect(page).toHaveURL(/#home$/);
  await chat.getByRole("textbox").fill("Help me plan dinner");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat.getByText("Help me plan dinner", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(chat.getByText("Help me plan dinner", { exact: true })).toBeVisible();
  await chat.getByRole("button", { name: "View Details" }).click();
  await expect(chat).toHaveCount(0);
  await expect(page).toHaveURL(/#meals$/);
});

test("Dashboard household controls save directly and update the meal plan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Get Started" }).click();
  await page.getByRole("combobox", { name: "Household size" }).selectOption("2");
  await page.getByRole("combobox", { name: "Number of days" }).selectOption("2");
  await expect(page).toHaveURL(/#home$/);
  await expect(page.getByRole("button", { name: "\u20b1500 My Budget" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Household size" })).toHaveValue("2");
  await expect(page.getByRole("combobox", { name: "Number of days" })).toHaveValue("2");
  await page.getByRole("button", { name: "Plan My Meals" }).click();
  await expect(page.getByText("\u20b1295", { exact: true })).toBeVisible();
});
