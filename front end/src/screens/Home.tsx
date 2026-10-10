import { useState } from "react";
import {
  Menu,
  Wallet,
  ChevronDown,
  Users,
  CalendarDays,
  Sparkles,
  ShoppingCart,
  Refrigerator,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import { BrandImage, Button, Status, type T, type Screen } from "../components";
import { householdLimits, type State } from "../state";
import NumberSheet from "../components/NumberSheet";
export default function Home({
  state,
  t,
  navigate,
  online,
  onPlan,
  onHouseholdChange,
}: {
  state: State;
  t: T;
  navigate: (screen: Screen) => void;
  online: boolean;
  onPlan: (budget: number) => void;
  onHouseholdChange: (field: "people" | "days", value: number) => void;
}) {
  const [budget, setBudget] = useState(String(state.budget));
  return (
    <>
      <header className="home-header">
        <button
          className="icon-button"
          aria-label={t("more")}
          onClick={() => navigate("more")}
        >
          <Menu />
        </button>
        <BrandImage kind="logo" className="header-logo" />
        <Status online={online} t={t} />
      </header>
      <section className="greeting">
        <div>
          <h1>{t("greeting")}</h1>
          <p>{t("ready")}</p>
        </div>
        <button
          type="button"
          className="mascot-chat-button"
          aria-label={
            state.language === "fil"
              ? "Makipag-chat kay Kasya"
              : "Chat with Kasya"
          }
          onClick={() => navigate("chat")}
        >
          <BrandImage kind="mascot" className="welcome-kasya" />
        </button>
      </section>
      <main className="screen-content home-content">
        <form
          className="home-planning-form"
          onSubmit={(e) => {
            e.preventDefault();
            onPlan(Number(budget));
          }}
        >
          <label className="budget-card">
            <span className="wallet-icon">
              <Wallet size={37} />
            </span>
            <span>
              <span>{t("budget")}</span>
              <input
                aria-label={t("amount")}
                type="number"
                inputMode="decimal"
                required
                min="0.01"
                max="10000000"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </span>
          </label>
          <div className="household-grid">
            <NumberSheet
              value={state.people}
              min={1}
              max={householdLimits.people}
              label={t("household")}
              title={
                state.language === "fil" ? "Ilang tao?" : "How many people?"
              }
              t={t}
              className="stat-card"
              onConfirm={(value) => onHouseholdChange("people", value)}
            >
              <Users aria-hidden="true" />
              <span>
                <strong className="stat-value">
                  {state.people}
                  <ChevronDown size={15} aria-hidden="true" />
                </strong>
                {t("people")}
              </span>
            </NumberSheet>
            <NumberSheet
              value={state.days}
              min={1}
              max={householdLimits.days}
              label={t("planningDays")}
              title={
                state.language === "fil" ? "Ilang araw?" : "How many days?"
              }
              t={t}
              className="stat-card days-card"
              onConfirm={(value) => onHouseholdChange("days", value)}
            >
              <CalendarDays aria-hidden="true" />
              <span>
                <strong className="stat-value">
                  {state.days}
                  <ChevronDown size={15} aria-hidden="true" />
                </strong>
                {t("days")}
              </span>
            </NumberSheet>
          </div>
          <Button type="submit">
            <Sparkles className="yellow" />
            {t("plan")}
          </Button>
        </form>
        <div className="quick-actions">
          {(
            [
              {
                screen: "grocery",
                key: "grocery",
                icon: ShoppingCart,
                color: "coral",
              },
              {
                screen: "pantry",
                key: "pantryCheck",
                icon: Refrigerator,
                color: "blue",
              },
              {
                screen: "meals",
                key: "myMeals",
                icon: CalendarDays,
                color: "green",
              },
              {
                screen: "insights",
                key: "insights",
                icon: ChartNoAxesColumnIncreasing,
                color: "purple",
              },
            ] as const
          ).map(({ screen, key, icon: Icon, color }) => (
            <button key={screen} onClick={() => navigate(screen)}>
              <span className={color}>
                <Icon />
              </span>
              <strong>{t(key)}</strong>
            </button>
          ))}
        </div>
      </main>
    </>
  );
}
