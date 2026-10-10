import type { State } from "./state";
import { allergyTerms } from "./allergies";
export type Purchase = {
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
  cost_php: number;
  price_source_type: string;
  price_observed_at: string;
};
export type MealOption = {
  steps?: string[];
  recipe_id: string;
  recipe_name: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  estimated_total_php: number;
  remaining_php: number;
  items_to_buy: Purchase[];
  pantry_items_used: { name: string; quantity: number; unit: string }[];
  warnings: string[];
};
export type Plan = {
  meal_alternatives?: MealAlternative[];
  removed_cost_php?: number;
  schedule?: ScheduledDay[];
  total_spent_php?: number;
  remaining_total_php?: number;
  shopping_list?: boolean;
  basic_food?: boolean;
  status: string;
  budget_php: number;
  options: MealOption[];
  reason_if_no_match: string | null;
};
export type ScheduledDay = {
  extra_groceries?: MealOption | null;
  day: number;
  allocated_php: number;
  spent_php: number;
  remaining_php: number;
  meals: {
    skipped?: boolean;
    meal_type: "breakfast" | "lunch" | "dinner";
    option: MealOption | null;
    cost_php: number;
    remaining_day_php: number;
    remaining_total_php: number;
    reason: string | null;
  }[];
};
export type Interpretation = {
  meal_choices?: MealSelection[];
  skipped_meals?: {
    day: number;
    meal_type: "breakfast" | "lunch" | "dinner";
  }[];
  budget_basis?: "total" | "per_day";
  days?: number | null;
  scenario_budget_php?: number | null;
  shopping_items?: { term: string; quantity: number; unit?: string }[];
  pantry_empty?: boolean;
  intent: string;
  budget_php: number | null;
  servings: number | null;
  meal_type: string | null;
  excluded_ingredients: string[];
  max_prep_minutes: number | null;
  clarification_question: string | null;
  confidence_note: string;
};
export type LocalAIStatus = { ready: boolean; message: string };
export type MealSelection = {
  day: number;
  meal_type: "breakfast" | "lunch" | "dinner";
  recipe_id: string;
};
export type MealAlternative = {
  recipe_id: string;
  recipe_name: string;
  cost_php: number;
  plan: Plan;
  meal_choices: MealSelection[];
};
let startupRequest: Promise<LocalAIStatus> | undefined;
export function startLocalAI(): Promise<LocalAIStatus> {
  if (!startupRequest) {
    startupRequest = api<LocalAIStatus>(
      "/agent/start",
      {},
      undefined,
      75000,
    ).finally(() => {
      startupRequest = undefined;
    });
  }
  return startupRequest;
}
export type Ingredient = {
  ingredient_id: string;
  canonical_name: string;
  aliases: string[];
  base_unit: string;
};
export type Recipe = {
  recipe_id: string;
  name: string;
  base_servings: number;
  prep_minutes: number;
  cook_minutes: number;
  steps: string[];
  ingredients: {
    ingredient_id: string;
    name: string;
    quantity: number;
    unit: string;
  }[];
  source_title: string;
  source_url_or_note: string;
};
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const base = (env?.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  timeoutMs = 15000,
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      typeof error?.detail === "string"
        ? error.detail
        : `Local service returned ${response.status}.`,
    );
  }
  return response.json() as Promise<T>;
}
export function findIngredient(items: Ingredient[], name: string) {
  const normalized = name.trim().toLowerCase();
  return items.find((item) =>
    [item.ingredient_id, item.canonical_name, ...item.aliases].some(
      (alias) => alias.toLowerCase() === normalized,
    ),
  );
}
export async function generatePlan(
  state: State,
  budget = state.budget / state.days,
  interpretation?: Interpretation,
  signal?: AbortSignal,
  alternative?: {
    target_day: number;
    target_meal_type: "breakfast" | "lunch" | "dinner";
    exclude_recipe_id: string;
  },
): Promise<{ plan: Plan; warnings: string[] }> {
  const ingredients = await api<Ingredient[]>(
    "/ingredients",
    undefined,
    signal,
  );
  const warnings: string[] = [];
  const pantry = state.pantry.flatMap((item) => {
    const ingredient =
      findIngredient(ingredients, item.name) ??
      findIngredient(ingredients, item.id);
    const quantity = parseQuantity(item.quantity);
    if (
      !ingredient ||
      !quantity ||
      unitBase(quantity.unit) !== ingredient.base_unit
    ) {
      warnings.push(
        `Pantry item ${item.name} was not counted: use a known ingredient and a quantity in g, kg, ml, L, or pcs.`,
      );
      return [];
    }
    return [
      {
        ingredient_id: ingredient.ingredient_id,
        quantity: quantity.quantity,
        unit: quantity.unit,
      },
    ];
  });
  const excluded = [
    ...new Set([
      ...allergyTerms(state.allergies),
      ...(interpretation?.excluded_ingredients ?? []),
    ]),
  ];
  const plan = await api<Plan>(
    alternative ? "/plans/alternatives" : "/plans/generate",
    {
      budget_php: budget,
      servings: interpretation?.servings ?? state.people,
      meal_scope:
        interpretation?.intent === "plan_meal" ? "day" : "single_meal",
      days: state.days,
      budget_basis: interpretation?.budget_basis ?? "total",
      skipped_meals: interpretation?.skipped_meals ?? [],
      meal_choices: interpretation?.meal_choices ?? [],
      ...alternative,
      meal_type: interpretation?.meal_type ?? "dinner",
      pantry,
      excluded_ingredient_ids: excluded,
      max_prep_minutes: interpretation?.max_prep_minutes ?? null,
      basic_food: interpretation?.intent === "buy_food",
      shopping_list: interpretation?.intent === "buy_food",
      shopping_items: interpretation?.shopping_items ?? [],
    },
    signal,
    alternative ? 45000 : 15000,
  );
  return { plan, warnings };
}
export function parseQuantity(text: string) {
  const match = text.match(
    /^\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pcs?|pieces?|bundle|tbsp|tsp|cup)\s*$/i,
  );
  if (!match) return null;
  const quantity = Number(match[1]);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  return {
    quantity,
    unit: match[2].toLowerCase().replace(/^pieces$/, "piece"),
  };
}
export function unitBase(unit: string) {
  if (["kg", "g"].includes(unit)) return "g";
  if (["l", "ml", "tbsp", "tsp", "cup"].includes(unit)) return "ml";
  if (["piece", "pc", "pcs"].includes(unit)) return "piece";
  return unit;
}
export async function savePantry(state: State) {
  const ingredients = await api<Ingredient[]>("/ingredients");
  const entries = state.pantry.map((item) => {
    const ingredient =
      findIngredient(ingredients, item.name) ??
      findIngredient(ingredients, item.id);
    const quantity = parseQuantity(item.quantity);
    if (
      !ingredient ||
      !quantity ||
      unitBase(quantity.unit) !== ingredient.base_unit
    )
      throw new Error(
        `Check ${item.name}: use a known ingredient and a quantity compatible with its unit.`,
      );
    return { ingredient_id: ingredient.ingredient_id, ...quantity };
  });
  if (
    new Set(entries.map((item) => item.ingredient_id)).size !== entries.length
  )
    throw new Error(
      "Combine duplicate pantry ingredients before saving to the backend.",
    );
  const existing =
    await api<{ ingredient_id: string; quantity: number; unit: string }[]>(
      "/pantry",
    );
  for (const item of entries) await api("/pantry/upsert", item);
  for (const item of existing.filter(
    (item) =>
      !entries.some((entry) => entry.ingredient_id === item.ingredient_id),
  ))
    await api("/pantry/upsert", { ...item, quantity: 0 });
}
export async function savePrices(state: State) {
  const ingredients = await api<Ingredient[]>("/ingredients");
  const entries = state.groceries.map((item) => {
    const ingredient =
      findIngredient(ingredients, item.id) ??
      findIngredient(ingredients, item.name);
    const quantity = parseQuantity(item.quantity);
    if (
      !ingredient ||
      !quantity ||
      quantity.quantity <= 0 ||
      item.price <= 0 ||
      unitBase(quantity.unit) !== ingredient.base_unit
    )
      return null;
    return {
      ingredient_id: ingredient.ingredient_id,
      amount_php: item.price,
      ...quantity,
      market_or_area: "AiKasya grocery list",
      source_type: "user_entered",
    };
  });
  for (const item of entries) if (item) await api("/prices/upsert", item);
  return {
    saved: entries.filter(Boolean).length,
    skipped: entries.filter((item) => !item).length,
  };
}
