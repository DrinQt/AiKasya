import { CalendarDays, Pencil, ChevronRight, ShoppingCart } from "lucide-react";
import { Button, BudgetStatus, type T } from "../components";
import type { State } from "../state";
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
  return (
    <main className="screen-content meal-content">
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
                </span>
                <ChevronRight size={21} />
              </button>
            </section>
          );
        })}
      </div>
      <div className="cost-card">
        <h3>{t("estimated")}</h3>
        <strong>{money(cost)}</strong>
        <BudgetStatus within={cost <= state.budget} t={t} />
      </div>
      <Button onClick={onAdd}>
        <ShoppingCart className="yellow" />
        {t("addGrocery")}
      </Button>
    </main>
  );
}
