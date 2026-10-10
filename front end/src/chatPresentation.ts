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
  if (plan.schedule?.length) {
    const skips = plan.schedule
      .flatMap((day) => day.meals)
      .filter((meal) => meal.skipped).length;
    const summary =
      language === "fil"
        ? `${plan.schedule.length} araw, may almusal, tanghalian at hapunan. Kabuuang badyet: ${money(plan.budget_php)}. Planong gastos: ${money(plan.total_spent_php ?? 0)}. Natitira: ${money(plan.remaining_total_php ?? 0)}.`
        : `${plan.schedule.length} days with breakfast, lunch and dinner. Total budget: ${money(plan.budget_php)}. Planned purchases: ${money(plan.total_spent_php ?? 0)}. Remaining: ${money(plan.remaining_total_php ?? 0)}.`;
    return (
      summary +
      (skips
        ? language === "fil"
          ? ` ${skips} pagkain ang nilaktawan; walang bawas sa badyet para rito.`
          : ` ${skips} requested meals skipped with no budget deduction.`
        : "") +
      (plan.status !== "feasible"
        ? ` ${plan.reason_if_no_match ?? "Some meals could not be scheduled."}`
        : "")
    );
  }
  if (plan.shopping_list)
    return plan.options.length
      ? language === "fil"
        ? `Ito ang isang listahan ng mabibili sa kabuuang ${money(plan.budget_php)}. Batay ito sa naka-save na presyo at pinakamaliit na dami ng pagbili. Kumpirmahin ang presyo at laki ng pakete sa tindahan. Listahan ito ng mga item, hindi recipe o buong menu.`
        : `Here is one shopping list within your total ${money(plan.budget_php)}. Planned purchases: ${money(plan.options[0].estimated_total_php)}. Remaining: ${money(plan.options[0].remaining_php)}. Quantities use saved prices and purchase increments. General lists aim to use the budget closely; named quantities stay fixed. Confirm prices and package sizes at the shop.`
      : (plan.reason_if_no_match ??
          "No items fit the amount with the saved prices.");
  if (plan.options.length)
    if (plan.basic_food)
      return language === "fil"
        ? `May simpleng mabibili sa ${money(plan.budget_php)} para sa isang pagkain. Piliin ang isang opsyon sa ibaba. Hilaw na sangkap ito: kailangan ng tubig, lutuan at panggatong; hindi kasama ang mga iyon sa presyo. Tantiya mula sa naka-save na presyo; kumpirmahin sa tindahan. Hindi ito buong menu para sa isang araw. Kung walang lutuan, itanong ang presyo ng kanin at ulam sa karinderya; wala akong kumpirmadong presyo ng lutong pagkain.`
        : `You can buy basic ingredients within ${money(plan.budget_php)} for one meal. Choose one option below. These need water, cooking equipment and fuel, which are not included in the cost. Estimates use saved prices; confirm at the shop. This is not a full day's menu. Without cooking access, ask a nearby eatery for rice and a dish within your budget; I don't have confirmed ready-to-eat prices.`;
    else
      return language === "fil"
        ? `Pasok sa ${money(plan.budget_php)} ang mga opsyong ito para sa isang pagkain. Pumili ng isa; hindi ito buong menu para sa isang araw.`
        : `These meal options fit ${money(plan.budget_php)}. Choose one meal from the options below; these are alternatives for one meal, not a full daily menu.`;
  const closest = closestMeal(plan);
  if (plan.basic_food && !plan.options.length)
    return language === "fil"
      ? `Walang simpleng opsyon na makumpirma sa ${money(plan.budget_php)} ayon sa presyo at mga bawal mong sangkap. Kung walang lutuan, itanong sa karinderya kung may kanin at ulam na pasok sa badyet; hindi ko alam ang kanilang presyo. ${plan.reason_if_no_match ?? ""}`
      : `I couldn't confirm a basic option within ${money(plan.budget_php)} using the saved prices and your exclusions. If you can't cook, ask a nearby eatery whether rice and a dish fit your budget; I don't have their prices. ${plan.reason_if_no_match ?? ""}`;
  if (closest)
    return language === "fil"
      ? `Kulang ang ${money(plan.budget_php)}. ${closest.name}: ${money(closest.cost)}. Magdagdag ng ${money(closest.cost - plan.budget_php)}.`
      : `No recipe in this library fits ${money(plan.budget_php)}. ${closest.name} costs ${money(closest.cost)}—add ${money(closest.cost - plan.budget_php)}, or try basic food within your budget.`;
  if (plan.reason_if_no_match) return plan.reason_if_no_match;
  return language === "fil"
    ? "Walang tugmang pagkain. Subukang dagdagan ang badyet o bawasan ang tao."
    : "No meal matches. Try a higher budget or fewer people.";
}
