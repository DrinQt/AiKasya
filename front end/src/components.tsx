import {
  ArrowRight,
  ChevronLeft,
  Home,
  Utensils,
  Settings,
  WifiOff,
  Check,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TranslationKey } from "./i18n";
export type Screen =
  | "welcome"
  | "home"
  | "chat"
  | "meals"
  | "grocery"
  | "pantry"
  | "insights"
  | "more"
  | "recipe"
  | "budget"
  | "market";
export type T = (key: TranslationKey) => string;
export function BrandImage({
  kind,
  className = "",
}: {
  kind: "logo" | "mascot";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div
      className={`asset-fallback ${className}`}
      role="img"
      aria-label={
        kind === "logo"
          ? "AiKasya — Bawat Piso, May Plano."
          : "Official basket mascot image missing"
      }
    >
      {kind === "logo" ? (
        <>
          <strong>
            Ai<span>K</span>asya
          </strong>
          <small>Bawat Piso, May Plano.</small>
        </>
      ) : (
        <>
          <span aria-hidden="true">🧺</span>
          <small>aikasya-mascot.png</small>
        </>
      )}
    </div>
  ) : (
    <img
      className={className}
      src={
        kind === "logo"
          ? "/assets/aikasya-logo-transparent.png"
          : "/assets/aikasya-mascot-transparent.png"
      }
      alt={
        kind === "logo"
          ? "AiKasya — Bawat Piso, May Plano."
          : "AiKasya basket mascot"
      }
      onError={() => setFailed(true)}
    />
  );
}
export function Button({
  children,
  onClick,
  type = "button",
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`primary-button ${className}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Header({
  title,
  onBack,
  action,
  t,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
  t: T;
}) {
  return (
    <header className="screen-header">
      <button className="icon-button" aria-label={t("back")} onClick={onBack}>
        <ChevronLeft />
      </button>
      <h1>{title}</h1>
      <div className="header-action">{action}</div>
    </header>
  );
}
export function BottomNav({
  screen,
  navigate,
  t,
}: {
  screen: Screen;
  navigate: (screen: Screen) => void;
  t: T;
}) {
  return (
    <nav className="bottom-nav" aria-label={t("home")}>
      {(
        [
          { screen: "home", key: "home", icon: Home },
          { screen: "meals", key: "meals", icon: Utensils },

          { screen: "more", key: "more", icon: Settings },
        ] as const
      ).map(({ screen: target, key, icon: Icon }) => (
        <button
          key={target}
          onClick={() => navigate(target)}
          aria-current={screen === target ? "page" : undefined}
          className={screen === target ? "active" : ""}
        >
          <Icon />
          <span>{t(key)}</span>
        </button>
      ))}
    </nav>
  );
}
export function MascotTip({ children }: { children: ReactNode }) {
  return (
    <div className="mascot-tip">
      <BrandImage kind="mascot" />
      <p>{children}</p>
    </div>
  );
}
export function Status({ online, t }: { online: boolean; t: T }) {
  return (
    <span className={`status-badge ${online ? "" : "disconnected"}`}>
      <i />
      {online ? (
        t("online")
      ) : (
        <>
          <WifiOff size={12} />
          {t("offline")}
        </>
      )}
    </span>
  );
}
export function PlanSummary({
  t,
  onDetails,
  language,
}: {
  t: T;
  onDetails: () => void;
  language: "en" | "fil";
}) {
  return (
    <div className="plan-summary">
      <h3>
        {t("mealPlan")} (2 {t("days").toLowerCase()})
      </h3>
      <div className="plan-table">
        <strong>{t("day")} 1</strong>
        <span>
          Adobo +{" "}
          {language === "fil" ? "Sinangag + Gulay" : "Garlic rice + Vegetables"}
        </span>
        <strong>{t("day")} 2</strong>
        <span>
          Monggo + {language === "fil" ? "Itlog + Gulay" : "Egg + Vegetables"}
        </span>
      </div>
      <button onClick={onDetails}>
        {t("details")} <ArrowRight size={17} />
      </button>
    </div>
  );
}
export function BudgetStatus({ within, t }: { within: boolean; t: T }) {
  return (
    <span className={`budget-status ${within ? "" : "over"}`}>
      <Check size={17} />
      {t(within ? "within" : "over")}
    </span>
  );
}
