import { Lightbulb } from "lucide-react";
import type { CSSProperties } from "react";
import type { T } from "../components";
import type { State } from "../state";
export default function Insights({
  state,
  t,
  money,
}: {
  state: State;
  t: T;
  money: (n: number) => string;
}) {
  const spending = state.groceries
    .filter((x) => x.checked)
    .reduce((a, b) => a + b.price, 0);
  const ratio = Math.min(100, Math.round((spending / state.budget) * 100));
  const bars = [52, 42, 74, 26, 55, 80, 32];
  return (
    <main className="screen-content insights-content">
      <section>
        <h2>{t("spending")}</h2>
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
      <section className="insight-tip">
        <h2>
          <Lightbulb className="yellow" />
          {t("tips")}
        </h2>
        <div className="yellow-tip">
          <Lightbulb />
          <p>{t("budgetTip")}</p>
        </div>
      </section>
      <section>
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
