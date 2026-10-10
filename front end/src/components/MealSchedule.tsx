import type { MealOption, Plan, MealAlternative } from "../api";
import type { T } from "../components";
import { useId, useRef, useState } from "react";
import PlanConclusion from "./PlanConclusion";
import { summarizePlan } from "../planInsights";

export default function MealSchedule({
  plan,
  language,
  t,
  onDetails,
  onAdd,
  onToggleMeal,
  disabled,
  onAlternatives,
  onChooseAlternative,
}: {
  plan: Plan;
  language: "en" | "fil";
  t: T;
  onDetails: (option: MealOption) => void;
  onAdd?: (option: MealOption) => void;
  onToggleMeal?: (
    day: number,
    meal: "breakfast" | "lunch" | "dinner",
    skip: boolean,
  ) => void;
  disabled?: boolean;
  onAlternatives?: (
    day: number,
    meal: "breakfast" | "lunch" | "dinner",
    recipeId: string,
  ) => Promise<MealAlternative[]>;
  onChooseAlternative?: (alternative: MealAlternative) => void;
}) {
  const schedule = plan.schedule ?? [];
  const [selectedDay, setSelectedDay] = useState(schedule[0]?.day);
  const activeDay = schedule.some((day) => day.day === selectedDay)
    ? selectedDay
    : schedule[0]?.day;
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [expandedMeal, setExpandedMeal] = useState("");
  const [loadingMeal, setLoadingMeal] = useState("");
  const [alternatives, setAlternatives] = useState<
    Record<string, MealAlternative[]>
  >({});
  const [alternativeError, setAlternativeError] = useState("");
  const money = (value: number) => `₱${value.toFixed(2)}`;
  const labels =
    language === "fil"
      ? { breakfast: "Almusal", lunch: "Tanghalian", dinner: "Hapunan" }
      : { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
  return (
    <div className="meal-schedule">
      <p className="subtext">
        {language === "fil"
          ? "Tantiyang bagong pagbili, hindi aktuwal na gastos. Isinasama ang natirang pantry at mga naunang binili sa mga susunod na pagkain."
          : "Estimated new purchases, not recorded spending. Pantry stock and leftover ingredients from earlier purchases carry into later meals."}
      </p>
      <div
        className="schedule-tabs"
        role="tablist"
        aria-label={language === "fil" ? "Mga araw ng plano" : "Meal plan days"}
      >
        {schedule.map((day, index) => (
          <button
            key={day.day}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${day.day}`}
            aria-controls={`${id}-panel-${day.day}`}
            aria-selected={activeDay === day.day}
            tabIndex={activeDay === day.day ? 0 : -1}
            onClick={() => setSelectedDay(day.day)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % schedule.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + schedule.length) % schedule.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? schedule.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setSelectedDay(schedule[next].day);
              tabs.current[next]?.focus();
              tabs.current[next]?.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
          >
            {language === "fil" ? "Araw" : "Day"} {day.day}
          </button>
        ))}
      </div>
      {schedule
        .filter((day) => day.day === activeDay)
        .map((day) => (
          <section
            className="scheduled-day"
            key={day.day}
            role="tabpanel"
            id={`${id}-panel-${day.day}`}
            aria-labelledby={`${id}-tab-${day.day}`}
            tabIndex={0}
          >
            <header>
              <h3>
                {language === "fil" ? "Araw" : "Day"} {day.day}
              </h3>
              <span>
                {language === "fil" ? "Badyet" : "Daily budget"}:{" "}
                {money(day.allocated_php)}
              </span>
            </header>
            {day.meals.map((meal, index) => {
              const before =
                index === 0
                  ? day.allocated_php
                  : day.meals[index - 1].remaining_day_php;
              return (
                <article className="scheduled-meal" key={meal.meal_type}>
                  <div className="scheduled-meal-heading">
                    <h4>{labels[meal.meal_type]}</h4>
                    <strong>
                      {meal.skipped
                        ? language === "fil"
                          ? "Nilaktawan · ₱0.00"
                          : "Skipped · ₱0.00"
                        : meal.option
                          ? money(meal.cost_php)
                          : language === "fil"
                            ? "Hindi naplano"
                            : "Not planned"}
                    </strong>
                  </div>
                  {meal.option ? (
                    <>
                      <p className="scheduled-recipe">
                        {meal.option.recipe_name}
                      </p>
                      <p className="subtext">
                        {meal.option.servings}{" "}
                        {language === "fil" ? "takal" : "servings"}
                      </p>
                    </>
                  ) : (
                    <p>{meal.reason}</p>
                  )}
                  <p className="scheduled-balance">
                    {money(before)} − {money(meal.cost_php)} ={" "}
                    <strong>{money(meal.remaining_day_php)}</strong>
                  </p>
                  <p className="subtext">
                    {language === "fil"
                      ? "Natitirang badyet sa araw"
                      : "Remaining for this day"}
                    : {money(meal.remaining_day_php)}
                  </p>
                  {(plan.schedule?.length ?? 0) > 1 && (
                    <p className="subtext">
                      {language === "fil"
                        ? "Kabuuang natitira"
                        : "Total remaining"}
                      : {money(meal.remaining_total_php)}
                    </p>
                  )}
                  {meal.option?.warnings.map((warning, i) => (
                    <p className="subtext" key={i}>
                      {warning}
                    </p>
                  ))}
                  {!!meal.option?.steps?.length && (
                    <details className="cooking-steps">
                      <summary>
                        {language === "fil"
                          ? "Mga hakbang sa pagluluto"
                          : "Cooking steps"}
                      </summary>
                      <ol>
                        {meal.option.steps.map((step, index) => (
                          <li key={index}>{step}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {meal.option && onAlternatives && onChooseAlternative && (
                    <>
                      <div className="scheduled-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={disabled || !!loadingMeal}
                          aria-expanded={
                            expandedMeal === `${day.day}-${meal.meal_type}`
                          }
                          aria-label={`Other meals for ${meal.meal_type} on Day ${day.day}`}
                          onClick={async () => {
                            const key = `${day.day}-${meal.meal_type}`;
                            if (expandedMeal === key) {
                              setExpandedMeal("");
                              return;
                            }
                            setExpandedMeal(key);
                            setAlternativeError("");
                            if (alternatives[key]) return;
                            setLoadingMeal(key);
                            try {
                              const options = await onAlternatives(
                                day.day,
                                meal.meal_type,
                                meal.option!.recipe_id,
                              );
                              setAlternatives((current) => ({
                                ...current,
                                [key]: options,
                              }));
                            } catch {
                              setAlternativeError(
                                "Could not load meal options. Try again.",
                              );
                            } finally {
                              setLoadingMeal("");
                            }
                          }}
                        >
                          {language === "fil"
                            ? "Ibang pagkain sa badyet"
                            : "Other meals within budget"}
                        </button>
                      </div>
                      {expandedMeal === `${day.day}-${meal.meal_type}` && (
                        <div
                          className="meal-alternatives"
                          role="group"
                          aria-label="Meal alternatives"
                        >
                          <p className="subtext">
                            {language === "fil"
                              ? "Muling kinakalkula ang buong plano kapag nagpalit ng pagkain."
                              : "Choosing a meal recalculates the full plan within your budget."}
                          </p>
                          {loadingMeal && <p role="status">Finding options…</p>}
                          {alternativeError && (
                            <p role="alert">{alternativeError}</p>
                          )}
                          {!loadingMeal &&
                            !alternativeError &&
                            alternatives[expandedMeal]?.length === 0 && (
                              <p>
                                No other complete plan fits your budget and
                                restrictions.
                              </p>
                            )}
                          {alternatives[expandedMeal]?.map((option) => (
                            <button
                              type="button"
                              className="secondary-button"
                              key={option.recipe_id}
                              disabled={disabled}
                              onClick={() => onChooseAlternative(option)}
                            >
                              {option.recipe_name} · {money(option.cost_php)}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {(meal.option || onToggleMeal) && (
                    <div className="scheduled-actions">
                      {meal.option && (
                        <>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => onDetails(meal.option!)}
                          >
                            {t("details")}
                          </button>
                          {onAdd && meal.option.items_to_buy.length > 0 && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => onAdd(meal.option!)}
                            >
                              {t("addGrocery")}
                            </button>
                          )}
                        </>
                      )}
                      {onToggleMeal && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={disabled}
                          aria-label={`${meal.skipped ? "Include" : "Skip"} ${meal.meal_type} on Day ${day.day}`}
                          onClick={() =>
                            onToggleMeal(day.day, meal.meal_type, !meal.skipped)
                          }
                        >
                          {language === "fil"
                            ? meal.skipped
                              ? "Isama ang pagkain"
                              : "Laktawan ang pagkain"
                            : `${meal.skipped ? "Include" : "Skip"} ${labels[meal.meal_type].toLowerCase()}`}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {day.extra_groceries && (
              <article
                className="scheduled-meal"
                aria-label={
                  language === "fil" ? "Dagdag na grocery" : "Extra groceries"
                }
              >
                <div className="scheduled-meal-heading">
                  <h4>
                    {language === "fil"
                      ? "Dagdag na grocery"
                      : "Extra groceries"}
                  </h4>
                  <strong>
                    {money(day.extra_groceries.estimated_total_php)}
                  </strong>
                </div>
                <p className="subtext">
                  {language === "fil"
                    ? "Dagdag na sangkap para magamit ang natitirang badyet. Hindi dagdag na takal ng pagkain; kasama sa stock para sa susunod na araw."
                    : "Additional food purchases to use the remaining budget. These are extra groceries, not larger meal portions; stock carries into later days."}
                </p>
                {day.extra_groceries.items_to_buy.map((item) => (
                  <p key={item.ingredient_id}>
                    {item.name}: {item.quantity} {item.unit} ·{" "}
                    {money(item.cost_php)}
                  </p>
                ))}
                <p className="scheduled-balance">
                  {money(
                    day.meals.at(-1)?.remaining_day_php ?? day.allocated_php,
                  )}{" "}
                  − {money(day.extra_groceries.estimated_total_php)} ={" "}
                  <strong>{money(day.remaining_php)}</strong>
                </p>
                <p className="subtext">
                  {language === "fil" ? "Kabuuang natitira" : "Total remaining"}
                  :{" "}
                  {money(
                    (day.meals.at(-1)?.remaining_total_php ?? plan.budget_php) -
                      day.extra_groceries.estimated_total_php,
                  )}
                </p>
                {day.extra_groceries.warnings.map((warning, index) => (
                  <p className="subtext" key={index}>
                    {warning}
                  </p>
                ))}
                {onAdd && (
                  <div className="scheduled-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onAdd(day.extra_groceries!)}
                    >
                      {t("addGrocery")}
                    </button>
                  </div>
                )}
              </article>
            )}
            <footer>
              {language === "fil" ? "Planong gastos" : "Planned purchases"}:{" "}
              {money(day.spent_php)} ·{" "}
              {language === "fil" ? "Natitira" : "Remaining"}:{" "}
              {money(day.remaining_php)}
            </footer>
          </section>
        ))}
      <PlanConclusion
        insight={summarizePlan(
          plan,
          id,
          schedule.flatMap((day) => day.meals).find((meal) => meal.option)
            ?.option?.servings ?? 1,
          schedule.length,
        )!}
        language={language}
      />
    </div>
  );
}
