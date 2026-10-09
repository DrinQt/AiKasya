import { useState } from "react";
import { Button, type T } from "../components";
import type { State } from "../state";
export default function BudgetSetup({
  state,
  t,
  onSave,
}: {
  state: State;
  t: T;
  onSave: (budget: number, people: number, days: number) => void;
}) {
  const [budget, setBudget] = useState(String(state.budget));
  const [people, setPeople] = useState(String(state.people));
  const [days, setDays] = useState(String(state.days));
  const [error, setError] = useState(false);
  return (
    <main>
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
          !Number.isInteger(p) ||
          p < 1 ||
          p > 20 ||
          !Number.isInteger(d) ||
          d < 1 ||
          d > 30
        ) {
          setError(true);
          return;
        }
        onSave(b, p, d);
      }}
    >
      <p className="subtext">{t("budgetInstructions")}</p>
      <label>
        {t("amount")}
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          min="0.01"
          max="10000000"
          step="0.01"
          required
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </label>
      <label>
        {t("household")}
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="20"
          required
          value={people}
          onChange={(e) => setPeople(e.target.value)}
        />
      </label>
      <label>
        {t("planningDays")}
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="30"
          required
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {t("invalid")}
        </p>
      )}
      <Button type="submit">{t("save")}</Button>
    </form>
    </main>
  );
}
