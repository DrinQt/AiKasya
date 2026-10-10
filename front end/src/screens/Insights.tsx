import { MascotTip } from "../components";
import { categories, categoryOf, copy } from "../plannerUI";
import type { CSSProperties } from "react";
import { useState } from "react";
import type { T } from "../components";
import type { State } from "../state";
import PlanConclusion from "../components/PlanConclusion";
export default function Insights({
  state,
  t,
  money,
  onReset,
}: {
  state: State;
  t: T;
  money: (n: number) => string;
  onReset: () => void;
}) {
  const [resetNotice, setResetNotice] = useState(false);
  const spending = state.groceries
    .filter((x) => x.checked)
    .filter((x) => !state.insightsExcludedGroceryIds.includes(x.id))
    .reduce((a, b) => a + b.price, 0);
  const ratio = Math.min(
    100,
    Math.max(0, Math.round((spending / (state.budget || 1)) * 100)),
  );
  const bars = [52, 42, 74, 26, 55, 80, 32];
  const label = (en: string, fil: string) => copy(state.language, en, fil);
  const checked = state.groceries.filter(
    (x) => x.checked && !state.insightsExcludedGroceryIds.includes(x.id),
  );
  return (
    <main className="screen-content insights-content">
      <section className="planner-hero">
        <span className="eyebrow">
          {label("EVERY PESO HAS A PURPOSE", "MAY PLANO ANG BAWAT PISO")}
        </span>
        <h2>
          {label("Your budget, at a glance.", "Isang tingin sa iyong badyet.")}
        </h2>
        <p>
          {label(
            "Based on items checked since the last Insights reset and their saved prices. These may still be estimates.",
            "Batay sa mga nabiling item at naka-save na presyo. Maaaring tantiya pa rin ang mga ito.",
          )}
        </p>
      </section>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          onReset();
          setResetNotice(true);
        }}
      >
        {label("Reset insights", "I-reset ang Insights")}
      </button>
      {resetNotice && (
        <p role="status">
          {label(
            "Insights reset. New purchases will start a new tracking period.",
            "Na-reset ang Insights. Bagong tala ang mga susunod na pagbili.",
          )}
        </p>
      )}
      <p className="subtext">
        {label(
          "Reset clears plan conclusions and starts a new grocery tracking period. Your grocery items stay saved.",
          "Binubura ng reset ang mga buod at nagsisimula ng bagong tala ng pagbili. Mananatili ang grocery list.",
        )}
      </p>
      {(["meal_plan", "shopping_list"] as const).map((feature) => {
        const insight = state.planInsights[feature];
        return insight ? (
          <PlanConclusion
            key={feature}
            insight={insight}
            language={state.language}
            title={
              feature === "meal_plan"
                ? label("Latest meal plan", "Pinakabagong plano ng pagkain")
                : label("Latest shopping list", "Pinakabagong listahan")
            }
            label={
              feature === "meal_plan"
                ? "Latest meal plan insights"
                : "Latest shopping list insights"
            }
          />
        ) : null;
      })}
      <p className="subtext">
        {label(
          "Plan conclusions are estimates, separate from checked grocery totals. Each feature shows its latest plan; drafts are not added together as spending.",
          "Tantiya ang mga buod ng plano at hiwalay sa mga nabiling grocery. Pinakabagong plano lang ang ipinapakita bawat feature.",
        )}
      </p>
      <section className="insight-panel">
        <h2>{label("Checked-item total", "Kabuuan ng mga nabiling item")}</h2>
        <div className="spending-overview">
          <div
            className="spending-ring"
            style={{ "--spent": `${ratio}%` } as CSSProperties}
            role="img"
            aria-label={`${t("food")}: ${money(spending)} ${t("of")} ${money(state.budget)}`}
          >
            <div>
              <strong>{money(spending)}</strong>
              <small>
                {t("of")} {money(state.budget)}
              </small>
            </div>
          </div>
          <div className="chart-legend">
            <p>
              <i />
              {t("food")}
              <strong>{ratio}%</strong>
            </p>
            <p>
              <i className="grey" />
              {t("remaining")}
              <strong>{100 - ratio}%</strong>
            </p>
          </div>
        </div>
        <p className="subtext spending-caption">
          {t("purchaseTotal")}: {money(spending)}
        </p>
      </section>
      <section className="insight-panel">
        <div className="insight-amounts">
          <p>
            {t("budget")}
            <strong>{money(state.budget)}</strong>
          </p>
          <p className={spending > state.budget ? "amount-over" : ""}>
            {t("remaining")}
            <strong>{money(state.budget - spending)}</strong>
          </p>
        </div>
        {!checked.length && (
          <p className="empty-insight">
            {label(
              "No purchases checked yet. Check items in your grocery list to see your totals here.",
              "Wala pang nabiling item. Markahan ang mga ito sa grocery list upang makita ang kabuuan.",
            )}
          </p>
        )}
      </section>
      {checked.length > 0 && (
        <section className="insight-panel">
          <h2>
            {label("By ingredient category", "Ayon sa kategorya ng sangkap")}
          </h2>
          <p className="panel-caption">
            {label(
              "Checked items - Saved prices",
              "Mga nabiling item - Naka-save na presyo",
            )}
          </p>
          {categories.map((category) => {
            const items = checked.filter(
              (item) => categoryOf(item) === category.id,
            );
            if (!items.length) return null;
            const amount = items.reduce((sum, item) => sum + item.price, 0);
            return (
              <div className="category-total" key={category.id}>
                <span aria-hidden="true">{category.icon}</span>
                <span>
                  {state.language === "fil" ? category.fil : category.en}
                </span>
                <strong>{money(amount)}</strong>
              </div>
            );
          })}
        </section>
      )}
      <MascotTip>{t("budgetTip")}</MascotTip>
      <section className="insight-panel">
        <h2>{label("Weekly view", "Lingguhang tanaw")}</h2>
        <p className="panel-caption">
          {label(
            "Demo only - This app does not record purchase dates yet.",
            "Demo lamang - Wala pang tala ng petsa ng pagbili ang app.",
          )}
        </p>
        <div className="bar-chart" role="img" aria-label={t("weeklyDemo")}>
          {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(
            (day, i) => (
              <div key={day} className="bar-column">
                <div
                  className={`bar ${i === 3 || i > 4 ? "grey" : ""}`}
                  style={{ height: `${bars[i]}%` }}
                />
                <span>{t(day)}</span>
              </div>
            ),
          )}
        </div>
        <p className="demo-label chart-caption">{t("weeklyDemo")}</p>
      </section>
    </main>
  );
}
