import {
  Menu,
  Wallet,
  ChevronRight,
  Users,
  CalendarDays,
  Sparkles,
  ShoppingCart,
  Refrigerator,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import { BrandImage, Button, Status, type T, type Screen } from "../components";
import type { State } from "../state";
export default function Home({
  state,
  t,
  navigate,
  online,
  money,
  onHouseholdChange,
  onChat,
  chatOpen,
}: {
  state: State;
  t: T;
  navigate: (screen: Screen) => void;
  online: boolean;
  money: (n: number) => string;
  onChat: () => void;
  chatOpen: boolean;
  onHouseholdChange: (field: "people" | "days", value: number) => void;
}) {
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
        <button className="greeting-mascot" aria-label={t("chat")} aria-expanded={chatOpen} aria-controls="mascot-chat" onClick={onChat}>
          <BrandImage kind="mascot" />
        </button>
      </section>
      <main className="screen-content home-content">
        <button className="budget-card" onClick={() => navigate("budget")}>
          <span className="wallet-icon">
            <Wallet size={37} />
          </span>
          <span>
            <strong>{money(state.budget)}</strong>
            <span>{t("budget")}</span>
          </span>
          <ChevronRight />
        </button>
        <div className="household-grid">
          <label className="stat-card">
            <Users aria-hidden="true" />
            <span>
              <select aria-label={t("household")} value={state.people} onChange={e => onHouseholdChange("people", Number(e.target.value))}>
                {Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
              {t("people")}
            </span>
          </label>
          <label className="stat-card days-card">
            <CalendarDays aria-hidden="true" />
            <span>
              <select aria-label={t("planningDays")} value={state.days} onChange={e => onHouseholdChange("days", Number(e.target.value))}>
                {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
              {t("days")}
            </span>
          </label>
        </div>
        <Button onClick={() => navigate("meals")}>
          <Sparkles className="yellow" />
          {t("plan")}
        </Button>
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
