import { useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { BottomNav, Header, type Screen, type T } from "./components";
import { en, fil, type TranslationKey } from "./i18n";
import { useAppState } from "./state";
import { groceries, recipes } from "./data";
import Welcome from "./screens/Welcome";
import Home from "./screens/Home";
import BudgetSetup from "./screens/BudgetSetup";
import PlannerStart from "./screens/PlannerStart";
import AIChat from "./screens/AIChat";
import ConnectedRecipe from "./screens/ConnectedRecipe";
import type { MealOption, Recipe } from "./api";
import RecipeDetails from "./screens/RecipeDetails";
import GroceryList from "./screens/GroceryList";
import Pantry from "./screens/Pantry";
import Insights from "./screens/Insights";
import More from "./screens/More";
import { useInstall } from "./pwa";

const titles: Record<Exclude<Screen, "welcome" | "home">, TranslationKey> = {
  chat: "chat",
  meals: "mealPlan",
  grocery: "grocery",
  pantry: "pantry",
  insights: "insights",
  more: "more",
  recipe: "recipes",
  budget: "setup",
  market: "market",
};
const screens: Screen[] = [
  "welcome",
  "home",
  "chat",
  "meals",
  "grocery",
  "pantry",
  "insights",
  "more",
  "recipe",
  "budget",
  "market",
];
function currentScreen(started: boolean): Screen {
  const hash = window.location.hash.slice(1) as Screen;
  return screens.includes(hash) ? hash : started ? "home" : "welcome";
}

export default function App() {
  const { state, setState, storageError } = useAppState();
  const install = useInstall();
  const [screen, setScreen] = useState<Screen>(() =>
    currentScreen(state.started),
  );
  const [planReady, setPlanReady] = useState(false);
  const [planningIntent, setPlanningIntent] = useState<
    "plan_meal" | "buy_food"
  >("plan_meal");
  const [online, setOnline] = useState(navigator.onLine);
  const [backendRecipe, setBackendRecipe] = useState<{
    recipe: Recipe;
    option: MealOption;
  } | null>(null);
  const [recipeId, setRecipeId] = useState("adobo");
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const t: T = (key) => (state.language === "fil" ? fil : en)[key];
  const money = (n: number) =>
    new Intl.NumberFormat(state.language === "fil" ? "fil-PH" : "en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = state.language;
  }, [state.language]);
  useEffect(() => {
    const update = () => {
      const next = currentScreen(state.started);
      setScreen(next);
      if (next === "chat" || next === "meals") setPlanReady(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [state.started]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const navigate = (next: Screen) => {
    if (next === "meals") setPlanReady(false);

    window.location.hash = next;
    setScreen(next);
    window.scrollTo({ top: 0 });
  };
  const addIngredients = (ids: string[]) => {
    setState((s) => ({
      ...s,
      groceries: [
        ...s.groceries,
        ...groceries
          .filter(
            (item) =>
              ids.includes(item.id) &&
              !s.groceries.some((existing) => existing.id === item.id),
          )
          .map((item) => ({ ...item, checked: false })),
      ],
    }));
    setNotice("added");
    navigate("grocery");
  };
  const addBackendGroceries = (option: MealOption) => {
    setState((s) => ({
      ...s,
      groceries: [
        ...s.groceries.filter(
          (item) =>
            !option.items_to_buy.some(
              (purchase) => purchase.ingredient_id === item.id,
            ),
        ),
        ...option.items_to_buy.map((item) => ({
          id: item.ingredient_id,
          name: item.name,
          fil: item.name,
          quantity: `${item.quantity} ${item.unit}`,
          price: item.cost_php,
          checked: false,
        })),
      ],
    }));
    setNotice("added");
    navigate("grocery");
  };
  let content: ReactNode;
  switch (screen) {
    case "welcome":
      content = (
        <Welcome
          t={t}
          onStart={() => {
            setState((s) => ({ ...s, started: true }));
            navigate("home");
          }}
        />
      );
      break;
    case "home":
      content = (
        <Home
          state={state}
          t={t}
          onHouseholdChange={(field, value) =>
            setState((s) => ({ ...s, [field]: value }))
          }
          online={online}
          navigate={navigate}
          onPlan={(budget) => {
            setState((s) => ({
              ...s,
              budget,
              messages: s.messages.filter(
                (message) => message.context === "chat",
              ),
            }));
            navigate("meals");
          }}
        />
      );
      break;
    case "budget":
      content = (
        <BudgetSetup
          state={state}
          t={t}
          onHouseholdChange={(field, value) =>
            setState((s) => ({ ...s, [field]: value }))
          }
          onSave={(budget, people, days, allergies) => {
            setState((s) => ({ ...s, budget, people, days, allergies }));
            navigate("home");
          }}
        />
      );
      break;
    case "chat":
    case "meals":
      content = planReady ? (
        <>
          {screen === "meals" && (
            <div className="screen-content planning-toolbar">
              <button
                className="secondary-button"
                onClick={() => navigate("home")}
              >
                {state.language === "fil"
                  ? "Baguhin ang mga detalye"
                  : "Edit planning details"}
              </button>
            </div>
          )}
          <AIChat
            state={state}
            setState={setState}
            t={t}
            planningMode={screen === "meals"}
            autoStart={screen === "meals"}
            initialIntent={planningIntent}
            onAdd={addBackendGroceries}
            onDetails={(recipe, option) => {
              if (recipe && option) {
                setBackendRecipe({ recipe, option });
                navigate("recipe");
              }
            }}
          />
        </>
      ) : (
        <PlannerStart
          freeChat={screen === "chat"}
          state={state}
          t={t}
          onEdit={() => navigate("home")}
          onContinue={(allergies, intent) => {
            setState((s) => ({
              ...s,
              allergies,
              messages:
                screen === "meals" ||
                (s.messages
                  .filter((message) => message.context === "chat")
                  .reverse()
                  .find((message) => message.planRequest)?.planRequest
                  ?.intent ===
                  "buy_food") !==
                  (intent === "buy_food")
                  ? s.messages.filter(
                      (message) =>
                        (message.context ?? "home") !==
                        (screen === "meals" ? "home" : "chat"),
                    )
                  : s.messages,
            }));
            setPlanningIntent(intent);
            setPlanReady(true);
          }}
        />
      );
      break;
    case "recipe":
      content = backendRecipe ? (
        <ConnectedRecipe
          recipe={backendRecipe.recipe}
          option={backendRecipe.option}
          t={t}
          onAdd={() => addBackendGroceries(backendRecipe.option)}
        />
      ) : (
        <RecipeDetails
          recipeId={recipeId}
          language={state.language}
          t={t}
          onAdd={() =>
            addIngredients(
              recipes.find((x) => x.id === recipeId)!.ingredientIds,
            )
          }
        />
      );
      break;
    case "grocery":
    case "market":
      content = (
        <GroceryList
          key={screen}
          state={state}
          setState={setState}
          t={t}
          money={money}
          market={screen === "market"}
          onMarket={() => navigate("market")}
        />
      );
      break;
    case "pantry":
      content = (
        <Pantry
          state={state}
          setState={setState}
          t={t}
          onSuggest={() => navigate("meals")}
        />
      );
      break;
    case "insights":
      content = (
        <Insights
          state={state}
          t={t}
          money={money}
          onReset={() => setState((s) => ({ ...s, planInsights: {}, insightsExcludedGroceryIds: s.groceries.filter((item) => item.checked).map((item) => item.id) }))}
        />
      );
      break;
    case "more":
      content = (
        <More
          state={state}
          setState={setState}
          t={t}
          navigate={navigate}
          onInstall={() => {
            void install().then((shown) => {
              if (!shown) setNotice("installed");
            });
          }}
        />
      );
      break;
  }
  return (
    <div
      className={`app-shell ${screen === "welcome" ? "is-welcome" : screen === "home" ? "is-home" : screen === "budget" ? "is-budget" : ""}`}
    >
      {storageError && (
        <p className="notice" role="status">
          {t("storageError")}
        </p>
      )}
      {!online && screen !== "welcome" && (
        <p className="notice" role="status">
          {t("offlineMessage")}
        </p>
      )}
      {screen !== "welcome" && screen !== "home" && (
        <Header
          title={t(titles[screen])}
          onBack={() =>
            navigate(
              screen === "recipe"
                ? "meals"
                : screen === "market"
                  ? "grocery"
                  : "home",
            )
          }
          t={t}
          action={
            (screen === "chat" || screen === "meals") && planReady ? (
              <button
                className="icon-button"
                aria-label={t("clearChat")}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    messages: s.messages.filter(
                      (message) =>
                        (message.context ?? "home") !==
                        (screen === "meals" ? "home" : "chat"),
                    ),
                  }))
                }
              >
                <Trash2 size={21} />
              </button>
            ) : undefined
          }
        />
      )}
      {content}
      {notice && (
        <div className="toast" role="status">
          {t(notice)}
        </div>
      )}
      {screen !== "welcome" && (
        <BottomNav screen={screen} navigate={navigate} t={t} />
      )}
    </div>
  );
}
