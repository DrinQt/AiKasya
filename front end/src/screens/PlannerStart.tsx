import { useState } from "react";
import { BrandImage, Button, type T } from "../components";
import FoodAllergies from "../components/FoodAllergies";
import type { AllergyPreferences } from "../allergies";
import type { State } from "../state";

export default function PlannerStart({
  state,
  t,
  onEdit,
  onContinue,
  freeChat = false,
}: {
  freeChat?: boolean;
  state: State;
  t: T;
  onEdit: () => void;
  onContinue: (
    allergies: AllergyPreferences,
    intent: "plan_meal" | "buy_food",
  ) => void;
}) {
  const [allergies, setAllergies] = useState(state.allergies);
  const [intent, setIntent] = useState<"plan_meal" | "buy_food" | null>(null);
  const [error, setError] = useState(false);
  const label = (en: string, fil: string) =>
    state.language === "fil" ? fil : en;
  return (
    <main className="screen-content planner-start">
      <section className="planner-hero">
        <BrandImage kind="mascot" className="context-mascot" />
        <h2>
          {label(
            "Before we start, a couple of questions",
            "Bago tayo magsimula, may ilang tanong ako",
          )}
        </h2>
        <p>
          {freeChat
            ? label(
                "Tell me your budget and household details in the chat.",
                "Sabihin ang badyet at bilang ng tao at araw sa chat.",
              )
            : label(
                "I'll use the details you set on Home.",
                "Gagamitin ko ang mga detalyeng inilagay mo sa Home.",
              )}
        </p>
        {!freeChat && (
          <>
            <p className="planning-summary">
              PHP {state.budget} · {state.people} {t("people")} · {state.days}{" "}
              {t("days")}
            </p>
            <button className="secondary-button" onClick={onEdit}>
              {label("Edit Home details", "Baguhin ang mga detalye sa Home")}
            </button>
          </>
        )}
      </section>
      <form
        className="home-planning-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!intent || (allergies.other && !allergies.custom.length)) {
            setError(true);
            return;
          }
          onContinue(allergies, intent);
        }}
      >
        <FoodAllergies
          title={label(
            "Does anyone have food allergies?",
            "May allergy ba sa pagkain ang sinuman?",
          )}
          value={allergies}
          onChange={(value) => {
            setAllergies(value);
            setError(false);
          }}
          t={t}
        />
        <fieldset className="planning-purpose">
          <legend>
            {label("What would you like help with?", "Ano ang kailangan mo?")}
          </legend>
          {(
            [
              {
                id: "plan_meal",
                en: "Meal plan",
                fil: "Plano ng pagkain",
              },
              {
                id: "buy_food",
                en: "Shopping list of items",
                fil: "Listahan ng mga mabibili",
              },
            ] as const
          ).map((option) => (
            <label key={option.id}>
              <input
                type="radio"
                name="purpose"
                required
                value={option.id}
                checked={intent === option.id}
                onChange={() => {
                  setIntent(option.id);
                  setError(false);
                }}
              />
              {label(option.en, option.fil)}
            </label>
          ))}
        </fieldset>
        <p>
          {label(
            "Meal plans include recipes and cooking steps for your household and days. Shopping lists use the full budget with saved prices and purchase units.",
            "Gagamitin ng pagkain at recipe ang badyet bawat araw at bilang ng tao. Gagamitin ng listahan ang kabuuang halaga at dami kada piraso kung may tala; hindi ito buong meal plan.",
          )}
        </p>
        {error && (
          <p role="alert" className="error">
            {t("allergyEmpty")}
          </p>
        )}
        <Button type="submit">
          {label("Continue with Kasya", "Magpatuloy kasama si Kasya")}
        </Button>
      </form>
    </main>
  );
}
