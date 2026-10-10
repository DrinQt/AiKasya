import { useEffect, useState } from "react";
import { readPlanInsights, type PlanInsight } from "./planInsights";
import {
  emptyAllergies,
  readAllergies,
  type AllergyPreferences,
} from "./allergies";
import {
  groceries,
  pantry,
  type GroceryItem,
  type PantryItem,
  type Message,
} from "./data";
export const householdLimits = { people: 20, days: 30 } as const;
export type State = {
  insightsExcludedGroceryIds: string[];
  planInsights: Partial<Record<PlanInsight["feature"], PlanInsight>>;
  language: "en" | "fil";
  started: boolean;
  budget: number;
  people: number;
  days: number;
  allergies: AllergyPreferences;
  groceries: GroceryItem[];
  pantry: PantryItem[];
  messages: Message[];
};
export const initialState: State = {
  insightsExcludedGroceryIds: [],
  planInsights: {},
  language: "en",
  started: false,
  budget: 500,
  people: 3,
  days: 3,
  allergies: emptyAllergies(),
  groceries,
  pantry,
  messages: [{ id: "hello", role: "assistant", key: "chatHello" }],
};
const storageKey = "aikasya.v1";
function readState(): State {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Partial<State>;
    return {
      ...initialState,
      ...saved,
      planInsights: readPlanInsights(saved.planInsights),
      insightsExcludedGroceryIds: Array.isArray(saved.insightsExcludedGroceryIds) ? saved.insightsExcludedGroceryIds.filter((id) => typeof id === "string") : [],
      language: saved.language === "fil" ? "fil" : "en",
      started: saved.started === true,
      allergies: readAllergies(saved.allergies),
      budget:
        typeof saved.budget === "number" &&
        Number.isFinite(saved.budget) &&
        saved.budget > 0 &&
        saved.budget <= 10000000
          ? saved.budget
          : 500,
      people:
        Number.isInteger(saved.people) &&
        saved.people! >= 1 &&
        saved.people! <= householdLimits.people
          ? saved.people!
          : 3,
      days:
        Number.isInteger(saved.days) &&
        saved.days! >= 1 &&
        saved.days! <= householdLimits.days
          ? saved.days!
          : 3,
      groceries:
        Array.isArray(saved.groceries) &&
        saved.groceries.every(
          (x) =>
            typeof x.id === "string" &&
            typeof x.name === "string" &&
            typeof x.price === "number" &&
            x.price >= 0 &&
            Number.isFinite(x.price) &&
            typeof x.checked === "boolean",
        )
          ? saved.groceries
          : groceries,
      pantry:
        Array.isArray(saved.pantry) &&
        saved.pantry.every(
          (x) =>
            typeof x.id === "string" &&
            typeof x.name === "string" &&
            typeof x.quantity === "string",
        )
          ? saved.pantry
          : pantry,
      messages:
        Array.isArray(saved.messages) &&
        saved.messages.every(
          (x) =>
            typeof x.id === "string" && ["assistant", "user"].includes(x.role),
        )
          ? saved.messages
          : initialState.messages,
    };
  } catch {
    return initialState;
  }
}
export function useAppState() {
  const [state, setState] = useState<State>(readState);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  return { state, setState, storageError };
}
