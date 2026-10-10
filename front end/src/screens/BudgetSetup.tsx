import { useState } from "react";
import {
  Wallet,
  ChevronDown,
  Users,
  CalendarDays,
  Minus,
  Plus,
  Lightbulb,
} from "lucide-react";
import { BrandImage, Button, type T } from "../components";
import { householdLimits, type State } from "../state";
import NumberSheet from "../components/NumberSheet";
import type { AllergyPreferences } from "../allergies";
import FoodAllergies from "../components/FoodAllergies";
export default function BudgetSetup({
  state,
  t,
  onSave,
  onHouseholdChange,
}: {
  onHouseholdChange: (field: "people" | "days", value: number) => void;
  state: State;
  t: T;
  onSave: (
    budget: number,
    people: number,
    days: number,
    allergies: AllergyPreferences,
  ) => void;
}) {
  const [budget, setBudget] = useState(String(state.budget));
  const people = String(state.people);
  const days = String(state.days);
  const setPeople = (value: string) => onHouseholdChange("people", Number(value));
  const setDays = (value: string) => onHouseholdChange("days", Number(value));
  const [error, setError] = useState(false);
  const [allergies, setAllergies] = useState(state.allergies);
  const [allergyError, setAllergyError] = useState(false);
  return (
    <main className="budget-setup-content">
      <form
        className="screen-content budget-form"
        onSubmit={(e) => {
          e.preventDefault();
          const b = Number(budget),
            p = Number(people),
            d = Number(days);
          if (
            !Number.isFinite(b) ||
            b <= 0 ||
            b > 10000000 ||
            !Number.isInteger(p) ||
            p < 1 ||
            p > householdLimits.people ||
            !Number.isInteger(d) ||
            d < 1 ||
            d > householdLimits.days
          ) {
            setError(true);
            return;
          }
          if (allergies.other && !allergies.custom.length) {
            setAllergyError(true);
            return;
          }
          onSave(b, p, d, allergies);
        }}
      >
        <section className="budget-intro">
          <div>
            <h2>{t("budgetIntro")}</h2>
            <p>{t("budgetSupport")}</p>
          </div>
          <BrandImage kind="mascot" />
        </section>
        <section className="budget-amount-card">
          <label htmlFor="food-budget" className="budget-field-heading">
            <Wallet size={23} />
            {t("foodBudgetLabel")}
          </label>
          <p id="budget-description">{t("budgetQuestion")}</p>
          <div className="budget-amount-input">
            <span aria-hidden="true">₱</span>
            <input
              id="food-budget"
              aria-label={t("amount")}
              aria-describedby="budget-description"
              type="number"
              inputMode="decimal"
              min="0.01"
              max="10000000"
              step="0.01"
              required
              value={budget}
              onChange={(e) => {
                setBudget(e.target.value);
                setError(false);
              }}
            />
          </div>
          <div
            className="budget-presets"
            role="group"
            aria-label={t("budgetPresets")}
          >
            {[300, 500, 1000].map((amount) => (
              <button
                type="button"
                key={amount}
                aria-pressed={Number(budget) === amount}
                onClick={() => {
                  setBudget(String(amount));
                  setError(false);
                }}
              >{`\u20b1${amount.toLocaleString("en-PH")}`}</button>
            ))}
          </div>
        </section>
        <div className="budget-stepper-grid">
          {[
            {
              id: "people",
              value: people,
              setter: setPeople,
              max: householdLimits.people,
              title: t("household"),
              Icon: Users,
            },
            {
              id: "days",
              value: days,
              setter: setDays,
              max: householdLimits.days,
              title: t("planningDays"),
              Icon: CalendarDays,
            },
          ].map(({ id, value, setter, max, title, Icon }) => (
            <section className="budget-stepper-card" key={id}>
              <Icon size={25} aria-hidden="true" />
              <span className="budget-number-label">{title}</span>
              <NumberSheet
                value={Number(value)}
                min={1}
                max={max}
                label={title}
                title={
                  id === "people"
                    ? state.language === "fil"
                      ? "Ilang tao?"
                      : "How many people?"
                    : state.language === "fil"
                      ? "Ilang araw?"
                      : "How many days?"
                }
                t={t}
                className="budget-number-trigger"
                onConfirm={(next) => {
                  setter(String(next));
                  setError(false);
                }}
              >
                {value}
                <ChevronDown size={16} aria-hidden="true" />
              </NumberSheet>
              <div className="stepper-buttons">
                <button
                  type="button"
                  aria-label={`${t("decrease")} ${title}`}
                  disabled={Number(value) <= 1}
                  onClick={() =>
                    setter(
                      String(
                        Math.max(1, Math.min(max, (Number(value) || 1) - 1)),
                      ),
                    )
                  }
                >
                  <Minus size={18} />
                </button>
                <span>1 - {max}</span>
                <button
                  type="button"
                  aria-label={`${t("increase")} ${title}`}
                  disabled={Number(value) >= max}
                  onClick={() =>
                    setter(
                      String(
                        Math.min(max, Math.max(1, (Number(value) || 0) + 1)),
                      ),
                    )
                  }
                >
                  <Plus size={18} />
                </button>
              </div>
            </section>
          ))}
        </div>
        <FoodAllergies
          value={allergies}
          onChange={(value) => {
            setAllergies(value);
            setAllergyError(false);
          }}
          t={t}
        />
        {allergyError && (
          <p className="error" role="alert">
            {t("allergyEmpty")}
          </p>
        )}
        <aside className="budget-pantry-tip">
          <Lightbulb size={24} />
          <p>{t("pantrySavingsTip")}</p>
        </aside>
        {error && (
          <p className="error" role="alert">
            {t("invalid")}
          </p>
        )}
        <Button type="submit">{t("savePreferences")}</Button>
      </form>
    </main>
  );
}
