import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import {
  BrandImage,
  BottomNav,
  Header,
  type Screen,
  type T,
} from "./components";
import { en, fil, type TranslationKey } from "./i18n";
import { useAppState } from "./state";
import { groceries, recipes } from "./data";
import Welcome from "./screens/Welcome";
import Home from "./screens/Home";
import BudgetSetup from "./screens/BudgetSetup";
import AIChat from "./screens/AIChat";
import ConnectedMeals from "./screens/ConnectedMeals";
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
  const [chatOpen, setChatOpen] = useState(false);
  const chatLauncher = useRef<HTMLButtonElement>(null);
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
      setScreen(currentScreen(state.started));
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
    setChatOpen(false);
    window.location.hash = next;
    setScreen(next);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!chatOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChatOpen(false);
        (
          chatLauncher.current ??
          document.querySelector<HTMLButtonElement>(".kasya-assistant-bar")
        )?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [chatOpen]);
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
  const addPlan = () =>
    addIngredients([
      ...new Set(
        Array.from(
          { length: state.days },
          (_, i) => recipes[i % recipes.length].ingredientIds,
        ).flat(),
      ),
    ]);

  const renderChat = (inline: boolean) => (
    <section
      className={inline ? "inline-chat" : "floating-chat"}
      role={inline ? "region" : "dialog"}
      aria-label={t("chat")}
      id="mascot-chat"
    >
      <header className="floating-chat-header">
        <BrandImage kind="mascot" />
        <h2>{t("chat")}</h2>
        <button
          className="icon-button"
          aria-label={t("clearChat")}
          onClick={() => setState((s) => ({ ...s, messages: [] }))}
        >
          <Trash2 size={18} />
        </button>
        <button
          className="icon-button"
          aria-label={
            state.language === "fil" ? "Isara ang chat" : "Close chat"
          }
          onClick={() => {
            setChatOpen(false);
            (
              chatLauncher.current ??
              document.querySelector<HTMLButtonElement>(".kasya-assistant-bar")
            )?.focus();
          }}
        >
          <X size={20} />
        </button>
      </header>
      <AIChat
        embedded={inline}
        state={state}
        setState={setState}
        t={t}
        onDetails={(recipe, option) => {
          if (recipe && option) {
            setBackendRecipe({ recipe, option });
            navigate("recipe");
          } else navigate("meals");
        }}
      />
    </section>
  );

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
          onChat={() => setChatOpen((open) => !open)}
          chatOpen={chatOpen}
          chatContent={chatOpen ? renderChat(true) : null}
          onHouseholdChange={(field, value) =>
            setState((s) => ({ ...s, [field]: value }))
          }
          online={online}
          money={money}
          navigate={navigate}
        />
      );
      break;
    case "budget":
      content = (
        <BudgetSetup
          state={state}
          t={t}
          onSave={(budget, people, days, allergies) => {
            setState((s) => ({ ...s, budget, people, days, allergies }));
            navigate("home");
          }}
        />
      );
      break;
    case "chat":
      content = (
        <AIChat
          state={state}
          setState={setState}
          t={t}
          onDetails={(recipe, option) => {
            if (recipe && option) {
              setBackendRecipe({ recipe, option });
              navigate("recipe");
            } else navigate("meals");
          }}
        />
      );
      break;
    case "meals":
      content = (
        <ConnectedMeals
          state={state}
          t={t}
          money={money}
          onSetup={() => navigate("budget")}
          onRecipe={(recipe, option) => {
            setBackendRecipe(recipe.steps ? { recipe, option } : null);
            setRecipeId(recipe.recipe_id);
            navigate("recipe");
          }}
          onAdd={addBackendGroceries}
          onSampleAdd={addPlan}
          onSampleRecipe={(id) => {
            setBackendRecipe(null);
            setRecipeId(id);
            navigate("recipe");
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
      content = <Insights state={state} t={t} money={money} />;
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
            screen === "chat" ? (
              <button
                className="icon-button"
                aria-label={t("clearChat")}
                onClick={() => setState((s) => ({ ...s, messages: [] }))}
              >
                <Trash2 size={21} />
              </button>
            ) : (
              <button
                ref={chatLauncher}
                className="header-chat-button"
                aria-label={t("chat")}
                aria-expanded={chatOpen}
                aria-controls="mascot-chat"
                onClick={() => setChatOpen((open) => !open)}
              >
                <BrandImage kind="mascot" />
              </button>
            )
          }
        />
      )}
      {content}
      {screen !== "welcome" && screen !== "chat" && screen !== "home" && (
        <>{chatOpen && renderChat(false)}</>
      )}
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
