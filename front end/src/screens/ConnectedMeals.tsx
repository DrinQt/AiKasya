import { useEffect, useState } from "react";
import {
  api,
  generatePlan,
  type MealOption,
  type Plan,
  type Recipe,
} from "../api";
import { Button, type T } from "../components";
import type { State } from "../state";
import MealPlanner from "./MealPlanner";
import { copy } from "../plannerUI";
export default function ConnectedMeals({
  state,
  t,
  money,
  onSetup,
  onRecipe,
  onAdd,
  onSampleAdd,
  onSampleRecipe,
}: {
  state: State;
  t: T;
  money: (n: number) => string;
  onSetup: () => void;
  onRecipe: (recipe: Recipe, option: MealOption) => void;
  onAdd: (option: MealOption) => void;
  onSampleAdd: () => void;
  onSampleRecipe: (id: string) => void;
}) {
  const [result, setResult] = useState<{
    plan: Plan;
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [recipeError, setRecipeError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setResult(null);
    generatePlan(state, undefined, undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            state.allergies.status === "restricted" ||
              (error instanceof Error &&
                error.message.startsWith("Please clarify"))
              ? error instanceof Error
                ? error.message
                : "Could not check household allergies. Please retry."
              : "Local backend unavailable. Showing the sample plan; start the backend and retry for calculated meals.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    state.budget,
    state.people,
    state.days,
    state.pantry,
    state.allergies,
    retry,
  ]);
  async function openRecipe(option: MealOption) {
    setRecipeError("");
    try {
      onRecipe(
        await api<Recipe>(`/recipes/${encodeURIComponent(option.recipe_id)}`),
        option,
      );
    } catch {
      setRecipeError(
        "Could not load the recipe. Check the local backend and try again.",
      );
    }
  }
  if (loading)
    return (
      <main className="screen-content">
        <p role="status">Calculating meals with the local backend...</p>
      </main>
    );
  const showSample =
    state.allergies.status !== "restricted" &&
    !error.startsWith("Please clarify");
  const ErrorContainer = showSample ? "div" : "main";
  if (error)
    return (
      <>
        <ErrorContainer className="screen-content meal-content">
          <p role="status">{error}</p>
          <Button onClick={() => setRetry((n) => n + 1)}>
            Retry local backend
          </Button>
        </ErrorContainer>
        {showSample && (
          <MealPlanner
            state={state}
            t={t}
            money={money}
            onSetup={onSetup}
            onRecipe={onSampleRecipe}
            onAdd={onSampleAdd}
          />
        )}
      </>
    );
  return (
    <main className="screen-content meal-content">
      <section className="planner-hero">
        <span className="eyebrow">
          {copy(
            state.language,
            "A PLAN FOR EVERY PESO",
            "PLANO PARA SA BAWAT PISO",
          )}
        </span>
        <h2>
          {copy(
            state.language,
            "Good meals. Happy budget.",
            "Masarap na pagkain. Sulit na badyet.",
          )}
        </h2>
        <p>
          {copy(
            state.language,
            "Meal options calculated for your budget and household preferences.",
            "Mga pagpipiliang pagkain ayon sa badyet at kagustuhan ng pamilya.",
          )}
        </p>
      </section>
      <button className="plan-banner" onClick={onSetup}>
        <span>
          <strong>Local meal options</strong>
          <small>
            {state.people} {t("people")} · {money(state.budget / state.days)}{" "}
            per day
          </small>
        </span>
      </button>
      <p className="subtext">
        Choose one meal option. Your budget is divided across {state.days} days;
        these are alternatives for one meal, not a complete daily menu.
      </p>
      {result?.warnings.map((warning) => (
        <p key={warning} className="subtext">
          {warning}
        </p>
      ))}
      {recipeError && <p role="alert">{recipeError}</p>}
      {!result?.plan.options.length && (
        <p role="status">
          {result?.plan.reason_if_no_match ?? "No matching meals were found."}
        </p>
      )}
      {result?.plan.options.map((option) => (
        <section className="simple-card" key={option.recipe_id}>
          <h2>{option.recipe_name}</h2>
          <p>
            {option.servings} servings ·{" "}
            {option.prep_minutes + option.cook_minutes} minutes
          </p>
          <p>
            <strong>{money(option.estimated_total_php)}</strong> ·{" "}
            {money(option.remaining_php)} remaining
          </p>
          <ul>
            {option.items_to_buy.map((item) => (
              <li key={item.ingredient_id}>
                {item.name}: {item.quantity} {item.unit} ·{" "}
                {money(item.cost_php)}
                <small className="subtext">
                  {" "}
                  ({item.price_source_type}, {item.price_observed_at})
                </small>
              </li>
            ))}
          </ul>
          {option.pantry_items_used.length > 0 && (
            <p>
              From pantry:{" "}
              {option.pantry_items_used
                .map((item) => `${item.name} (${item.quantity} ${item.unit})`)
                .join(", ")}
            </p>
          )}
          {option.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <div className="backend-actions">
            <Button onClick={() => void openRecipe(option)}>
              {t("details")}
            </Button>
            <Button onClick={() => onAdd(option)}>{t("addGrocery")}</Button>
          </div>
        </section>
      ))}
    </main>
  );
}
