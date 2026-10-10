import type { Plan } from "./api";
export type PlanInsight = {
  refunded?: number;
  id: string;
  feature: "meal_plan" | "shopping_list";
  budget: number;
  spent: number;
  remaining: number;
  complete: boolean;
  days: number;
  people: number;
};
export function summarizePlan(
  plan: Plan,
  id: string,
  people = 1,
  days = 1,
): PlanInsight | undefined {
  const spent = plan.schedule?.length
    ? (plan.total_spent_php ??
      plan.schedule.reduce((sum, day) => sum + day.spent_php, 0))
    : (plan.options[0]?.estimated_total_php ?? 0);
  return {
    refunded: plan.removed_cost_php ?? 0,
    id,
    feature: plan.shopping_list ? "shopping_list" : "meal_plan",
    budget: plan.budget_php,
    spent,
    remaining: Math.round((plan.budget_php - spent) * 100) / 100,
    complete: plan.status === "feasible",
    days: plan.schedule?.length ?? days,
    people,
  };
}
export function readPlanInsights(
  raw: unknown,
): Partial<Record<PlanInsight["feature"], PlanInsight>> {
  if (!raw || typeof raw !== "object") return {};
  const valid: Partial<Record<PlanInsight["feature"], PlanInsight>> = {};
  for (const feature of ["meal_plan", "shopping_list"] as const) {
    const value = (raw as Record<string, PlanInsight>)[feature];
    if (
      value &&
      value.feature === feature &&
      typeof value.id === "string" &&
      (value.refunded === undefined ||
        (Number.isFinite(value.refunded) && value.refunded >= 0)) &&
      [
        value.budget,
        value.spent,
        value.remaining,
        value.days,
        value.people,
      ].every(Number.isFinite) &&
      value.budget > 0 &&
      value.spent >= 0 &&
      value.remaining >= 0 &&
      value.days > 0 &&
      value.people > 0 &&
      typeof value.complete === "boolean"
    )
      valid[feature] = value;
  }
  return valid;
}
