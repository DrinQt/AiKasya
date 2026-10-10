import { CalendarDays, Pencil, ChevronRight, ShoppingCart } from "lucide-react";
import { Button, BudgetStatus, type T } from "../components";
import type { State } from "../state";
import { copy } from "../plannerUI";
import { recipes } from "../data";
export function planCost(people: number, days: number) {
  return Array.from(
    { length: days },
    (_, i) => (recipes[i % recipes.length].cost * people) / 2,
  ).reduce((a, b) => a + b, 0);
}
export default function MealPlanner({
  state,
  t,
  money,
  onSetup,
  onRecipe,
  onAdd,
}: {
  state: State;
  t: T;
  money: (n: number) => string;
  onSetup: () => void;
  onRecipe: (id: string) => void;
  onAdd: () => void;
}) {
  const cost = planCost(state.people, state.days);
  const label = (en: string, fil: string) => copy(state.language, en, fil);
  return (
    <main className="screen-content meal-content">
      <section className="planner-hero">
        <span className="eyebrow">
          {label("A PLAN FOR EVERY PESO", "PLANO PARA SA BAWAT PISO")}
        </span>
        <h2>
          {label(
            "Good meals. Happy budget.",
            "Masarap na pagkain. Sulit na badyet.",
          )}
        </h2>
        <p>
          {label(
            "Sample recipes - Prices are estimates, not confirmed expenses.",
            "Halimbawang mga recipe - Tantiya ang presyo, hindi kumpirmadong gastos.",
          )}
        </p>
      </section>
      <button className="plan-banner" onClick={onSetup}>
        <CalendarDays />
        <span>
          <strong>
            {state.days}-{t("day")} {t("meals")}
          </strong>
          <small>
            {state.people} {t("people").toLowerCase()} · {money(state.budget)}
          </small>
        </span>
        <Pencil size={19} />
      </button>
      <div className="meal-days">
        {Array.from({ length: state.days }, (_, i) => {
          const recipe = recipes[i % recipes.length];
          return (
            <section key={i}>
              <h2 className="day-label">
                {t("day")} {i + 1}
              </h2>
              <button className="meal-card" onClick={() => onRecipe(recipe.id)}>
                <div
                  className={`food-thumb ${recipe.id}`}
                  role="img"
                  aria-label={recipe.name}
                >
                  <img src={`/assets/${recipe.id}.jpg`} alt="" />
                </div>
                <span>
                  <strong>{recipe.name}</strong>
                  <small>
                    +{" "}
                    {(state.language === "fil" ? recipe.filSide : recipe.side)
                      .split(" + ")
                      .join("\n+ ")}
                  </small>
                  <span className="meal-meta">
                    {state.people} {label("servings", "hain")} &middot;{" "}
                    {t("estimated")}: {money((recipe.cost * state.people) / 2)}
                  </span>
                  <span className="ingredient-match">
                    {
                      recipe.ingredientIds.filter((id) =>
                        state.pantry.some((item) => item.id === id),
                      ).length
                    }
                    /{recipe.ingredientIds.length}{" "}
                    {label(
                      "listed ingredients in pantry",
                      "nakalistang sangkap sa pantry",
                    )}
                  </span>
                </span>
                <ChevronRight size={21} />
              </button>
            </section>
          );
        })}
      </div>
      <div className={`cost-card ${cost > state.budget ? "cost-over" : ""}`}>
        <h3>{t("estimated")}</h3>
        <strong>{money(cost)}</strong>
        <div className="cost-breakdown">
          <p>
            {state.days} {t("days")} &times; {state.people}{" "}
            {label("servings", "hain")}
          </p>
          <p>
            {label("Daily average", "Karaniwang gastos bawat araw")}
            <b>{money(cost / state.days)}</b>
          </p>
          <p>
            {t("budget")}
            <b>{money(state.budget)}</b>
          </p>
          <p>
            {t("remaining")}
            <b>{money(state.budget - cost)}</b>
          </p>
        </div>
        <BudgetStatus within={cost <= state.budget} t={t} />
      </div>
      <Button onClick={onAdd}>
        <ShoppingCart className="yellow" />
        {t("addGrocery")}
      </Button>
    </main>
  );
}
