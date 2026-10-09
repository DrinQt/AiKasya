import type { Plan } from "./api";
export function closestMeal(plan: Plan) {
  const match = plan.reason_if_no_match?.match(
    /closest meal was '(.+?)' needing an estimated [^\d]*(\d[\d,]*(?:\.\d+)?)/i,
  );
  return match
    ? { name: match[1], cost: Number(match[2].replaceAll(",", "")) }
    : null;
}
export function planReply(plan: Plan, language: "en" | "fil") {
  const money = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    }).format(value);
  if (plan.options.length)
    return language === "fil"
      ? `Heto ang mga pagkain na kasya sa ${money(plan.budget_php)}.`
      : `Here are meals within ${money(plan.budget_php)}.`;
  const closest = closestMeal(plan);
  if (closest)
    return language === "fil"
      ? `Kulang ang ${money(plan.budget_php)}. ${closest.name}: ${money(closest.cost)}. Magdagdag ng ${money(closest.cost - plan.budget_php)}.`
      : `No meal fits ${money(plan.budget_php)}. ${closest.name} costs ${money(closest.cost)}—add ${money(closest.cost - plan.budget_php)}.`;
  return language === "fil"
    ? "Walang tugmang pagkain. Subukang dagdagan ang badyet o bawasan ang tao."
    : "No meal matches. Try a higher budget or fewer people.";
}
