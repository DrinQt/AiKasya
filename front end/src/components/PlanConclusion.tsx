import type { PlanInsight } from "../planInsights";
export default function PlanConclusion({
  insight,
  language,
  title,
  label,
}: {
  insight: PlanInsight;
  language: "en" | "fil";
  title?: string;
  label?: string;
}) {
  const fil = language === "fil";
  const money = (value: number) => `₱${value.toFixed(2)}`;
  const used = Math.round((insight.spent / insight.budget) * 10000) / 100;
  return (
    <section
      className="schedule-conclusion"
      aria-label={label ?? (fil ? "Buod ng badyet" : "Plan budget summary")}
    >
      <h3>{title ?? (fil ? "Buod ng plano" : "Plan conclusion")}</h3>
      <dl>
        <div>
          <dt>{fil ? "Kabuuang badyet" : "Total budget"}</dt>
          <dd>{money(insight.budget)}</dd>
        </div>
        <div>
          <dt>{fil ? "Planong gastos" : "Planned purchases"}</dt>
          <dd>{money(insight.spent)}</dd>
        </div>
        <div className="schedule-leftover">
          <dt>{fil ? "Natitirang badyet" : "Budget left over"}</dt>
          <dd>{money(insight.remaining)}</dd>
        </div>
        <div>
          <dt>{fil ? "Nagamit na badyet" : "Budget used"}</dt>
          <dd>{used}%</dd>
        </div>
        {!!insight.refunded && <div><dt>{fil ? "Ibinalik mula sa mga inalis na item" : "Restored by removing items"}</dt><dd>{money(insight.refunded)}</dd></div>}
        {insight.feature === "meal_plan" && (
          <div>
            <dt>
              {fil
                ? "Karaniwang gastos bawat tao sa isang araw"
                : "Average per person per day"}
            </dt>
            <dd>{money(insight.spent / insight.people / insight.days)}</dd>
          </div>
        )}
      </dl>
      <p className="subtext">
        {fil
          ? `May ${money(insight.remaining)} pang natitira pagkatapos ng mga planong pagbili para sa ${insight.days} araw. Tantiyang hindi pa nagagamit na badyet ito.`
          : `You have ${money(insight.remaining)} left after planned purchases across ${insight.days} ${insight.days === 1 ? "day" : "days"}. This is your estimated unspent budget.`}
      </p>
      {!insight.complete && (
        <p className="subtext">
          {fil
            ? "May hindi pa naplanong pagkain na kailangan pang pagkasyahin sa natitirang badyet."
            : insight.feature === "shopping_list"
              ? "Some requested purchases could not be planned. The remaining budget is still available."
              : "Some meals are still unplanned and may need part of this remaining budget."}
        </p>
      )}
      <p className="subtext">
        {fil
          ? "Walang nakatalang paghahambing ng presyo para makumpirma ang diskuwento. Hindi kita ang natitirang badyet."
          : "Discounts need a recorded comparison price. Leftover budget is not income."}
      </p>
    </section>
  );
}
