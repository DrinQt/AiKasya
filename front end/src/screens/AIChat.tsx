import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  api,
  startLocalAI,
  generatePlan,
  type Interpretation,
  type MealOption,
  type MealAlternative,
  type Recipe,
} from "../api";
import { planReply } from "../chatPresentation";
import { Send } from "lucide-react";
import { BrandImage, PlanSummary, type T } from "../components";
import type { State } from "../state";
import MealSchedule from "../components/MealSchedule";
import PlanConclusion from "../components/PlanConclusion";
import { summarizePlan } from "../planInsights";
export default function AIChat({
  state,
  setState,
  t,
  onDetails,
  embedded = false,
  planningMode = false,
  autoStart = false,
  onAdd,
  initialIntent = "plan_meal",
}: {
  initialIntent?: "plan_meal" | "buy_food";
  planningMode?: boolean;
  autoStart?: boolean;
  onAdd?: (option: MealOption) => void;
  embedded?: boolean;
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  t: T;
  onDetails: (recipe?: Recipe, option?: MealOption) => void;
}) {
  const [draft, setDraft] = useState("");
  const context = planningMode ? "home" : "chat";
  const conversation = state.messages.filter(
    (message) => (message.context ?? "home") === context,
  );
  const [feature, setFeature] = useState<"plan_meal" | "buy_food">(
    [...conversation].reverse().find((message) => message.planRequest)
      ?.planRequest?.intent === "buy_food"
      ? "buy_food"
      : initialIntent,
  );
  const latestScheduleId = [...conversation]
    .reverse()
    .find((message) => message.localPlan?.schedule?.length)?.id;
  const latestPlanId = [...conversation]
    .reverse()
    .find((message) => message.localPlan)?.id;
  const [aiStartup, setAiStartup] = useState<{
    starting: boolean;
    ready: boolean;
    message: string;
  }>({ starting: true, ready: false, message: "" });
  const [startupAttempt, setStartupAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setAiStartup({ starting: true, ready: false, message: "" });
    startLocalAI()
      .then((result) => {
        if (active)
          setAiStartup({
            starting: false,
            ready: result.ready === true,
            message:
              result.message ||
              "Ollama is unavailable. Basic planning is still available.",
          });
      })
      .catch(() => {
        if (active)
          setAiStartup({
            starting: false,
            ready: false,
            message:
              "Could not start Ollama through the local backend. Check that the backend is running.",
          });
      });
    return () => {
      active = false;
    };
  }, [startupAttempt]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [state.messages.length]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    if (embedded) input.current?.scrollIntoView({ block: "nearest" });
  }, [embedded]);
  const [detailError, setDetailError] = useState("");
  const [pending, setPending] = useState(false);
  const started = useRef(false);
  const send = async (prompt = draft, constraints?: Interpretation) => {
    const text = prompt.trim();
    if (!text || pending || aiStartup.starting) return;
    const planningState = { ...state };
    const userId = crypto.randomUUID();
    setState((s) => ({
      ...s,
      messages: [...s.messages, { id: userId, role: "user", text, context }],
    }));
    setDraft("");
    setPending(true);
    let reply: import("../data").Message;
    let previousRequest = [...conversation]
      .reverse()
      .find((message) => message.planRequest)?.planRequest;
    try {
      const interpret = (intent = feature) =>
        api<Interpretation>(
          "/agent/interpret",
          {
            message: text,
            existing_constraints: {
              free_chat: !planningMode,
              budget_basis: planningMode
                ? "total"
                : (previousRequest?.budget_basis ?? "total"),
              budget_php: planningMode
                ? planningState.budget
                : previousRequest?.budget_php,
              servings: planningMode
                ? planningState.people
                : previousRequest?.servings,
              days: planningMode ? planningState.days : previousRequest?.days,
              intent: previousRequest?.intent ?? intent,
              shopping_items: previousRequest?.shopping_items ?? [],
              skipped_meals: previousRequest?.skipped_meals ?? [],
            },
          },
          undefined,
          70000,
        );
      let parsed = constraints ?? (await interpret());
      const nextFeature =
        parsed.intent === "buy_food"
          ? "buy_food"
          : parsed.intent === "view_recipe" || parsed.intent === "plan_meal"
            ? "plan_meal"
            : feature;
      if (nextFeature !== feature) {
        setFeature(nextFeature);
        previousRequest = undefined;
        setState((s) => ({
          ...s,
          messages: s.messages.filter(
            (message) =>
              (message.context ?? "home") !== context || message.id === userId,
          ),
        }));
        if (!constraints) parsed = await interpret(nextFeature);
      }
      if (parsed.intent === "view_recipe")
        parsed = { ...parsed, intent: "plan_meal" };
      const interpreted = {
        ...parsed,
        budget_php: planningMode ? planningState.budget : parsed.budget_php,
        servings: planningMode ? planningState.people : parsed.servings,
        meal_choices: (
          parsed.meal_choices ??
          previousRequest?.meal_choices ??
          []
        ).filter(
          (choice) =>
            choice.day <=
            (planningMode
              ? planningState.days
              : (parsed.days ?? previousRequest?.days ?? 1)),
        ),
        excluded_ingredients: [
          ...new Set([
            ...(previousRequest?.excluded_ingredients ?? []),
            ...parsed.excluded_ingredients,
          ]),
        ],
        clarification_question: !planningMode
          ? parsed.clarification_question
          : parsed.clarification_question &&
              !parsed.clarification_question.toLowerCase().includes("budget") &&
              !parsed.clarification_question.toLowerCase().includes("badyet")
            ? parsed.clarification_question
            : null,
      };
      const scenarioBudget = planningMode ? parsed.scenario_budget_php : null;
      const invalidScenario =
        scenarioBudget != null &&
        (!Number.isFinite(scenarioBudget) ||
          scenarioBudget <= 0 ||
          scenarioBudget > 10000000);
      if (invalidScenario) {
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            state.language === "fil"
              ? "Para sa paghahambing, pumili ng halagang higit sa ₱0 at hanggang ₱10,000,000."
              : "For a comparison, choose an amount above ₱0 and up to ₱10,000,000.",
        };
      } else if (interpreted.clarification_question) {
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: interpreted.clarification_question,
          planRequest: { ...interpreted, scenario_budget_php: null },
        };
      } else if (
        !["plan_meal", "view_recipe", "buy_food"].includes(interpreted.intent)
      ) {
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            state.language === "fil"
              ? "Maaari akong maghanap ng pagkain ayon sa badyet. Para baguhin ang pantry o presyo, gamitin ang kaukulang screen."
              : "I can find meals within your budget. Use the pantry and grocery screens to edit your stock or prices.",
        };
      } else {
        if (!planningMode) {
          planningState.budget = interpreted.budget_php ?? 0;
          planningState.people =
            interpreted.servings ?? (interpreted.intent === "buy_food" ? 1 : 0);
          planningState.days =
            parsed.days ?? (interpreted.intent === "buy_food" ? 1 : 0);
          if (
            planningState.budget <= 0 ||
            planningState.budget > 10000000 ||
            !Number.isInteger(planningState.people) ||
            planningState.people < 1 ||
            planningState.people > 20 ||
            !Number.isInteger(planningState.days) ||
            planningState.days < 1 ||
            planningState.days > 30
          ) {
            throw new Error(
              "Please clarify your total budget (above ₱0), people (1–20), and days (1–30).",
            );
          }
        }
        if (interpreted.pantry_empty) {
          planningState.pantry = [];
          setState((s) => ({ ...s, pantry: [] }));
        }
        const totalBudget = scenarioBudget ?? planningState.budget;
        const result = await generatePlan(
          planningState,
          totalBudget,
          interpreted,
        );
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            (scenarioBudget != null
              ? state.language === "fil"
                ? `Paghahambing sa ₱${scenarioBudget} ${interpreted.budget_basis === "per_day" ? "bawat araw" : "na kabuuang badyet"} para sa ${state.people} tao at ${state.days} araw. Naka-save pa rin sa Home ang ₱${state.budget}. `
                : `For a hypothetical ₱${scenarioBudget} ${interpreted.budget_basis === "per_day" ? "daily budget" : "total budget"}, keeping ${state.people} people and ${state.days} days. Your saved Home budget remains ₱${state.budget}. `
              : "") + planReply(result.plan, state.language),
          planRequest: {
            ...interpreted,
            scenario_budget_php: scenarioBudget,
            days: planningState.days,
            budget_php: planningState.budget,
            servings: planningState.people,
          },
          localPlan: result.plan,
        };
      }
    } catch (error) {
      reply = {
        id: crypto.randomUUID(),
        role: "assistant",
        text:
          error instanceof Error && error.message.startsWith("Please clarify")
            ? error.message
            : state.language === "fil"
              ? "Hindi makakonekta sa lokal na backend. Simulan ang backend at subukang muli."
              : "Could not reach the local backend. Start the backend and try again.",
      };
    } finally {
      setPending(false);
    }
    const insight = reply.localPlan
      ? summarizePlan(
          reply.localPlan,
          reply.id,
          reply.planRequest?.servings ?? 1,
          reply.planRequest?.days ?? 1,
        )
      : undefined;
    setState((s) =>
      s.messages.some((message) => message.id === userId)
        ? {
            ...s,
            messages: [...s.messages, { ...reply, context }],
            planInsights: insight
              ? { ...s.planInsights, [insight.feature]: insight }
              : s.planInsights,
          }
        : s,
    );
  };
  useEffect(() => {
    if (!autoStart || started.current || aiStartup.starting) return;
    started.current = true;
    void send(
      initialIntent === "buy_food"
        ? state.language === "fil"
          ? "Listahan ng mabibili gamit ang aking kabuuang badyet"
          : "Make a shopping list using my total budget"
        : state.language === "fil"
          ? "Magplano ng pagkain gamit ang aking badyet"
          : "Plan meals using my settings",
      {
        intent: initialIntent,
        budget_php: state.budget,
        servings: state.people,
        meal_type: null,
        excluded_ingredients: [],
        max_prep_minutes: null,
        clarification_question: null,
        confidence_note: "Confirmed planning details",
      },
    );
  }, [autoStart, aiStartup.starting]);
  const Container = embedded ? "div" : "main";
  const purpose =
    [...conversation].reverse().find((message) => message.planRequest)
      ?.planRequest?.intent ?? feature;
  return (
    <Container className="chat-screen">
      <div className="chat-features" role="group" aria-label="Chat feature">
        {(["plan_meal", "buy_food"] as const).map((intent) => (
          <button
            type="button"
            key={intent}
            aria-pressed={feature === intent}
            disabled={pending || aiStartup.starting}
            onClick={() => {
              if (intent === feature) return;
              setFeature(intent);
              setDraft("");
              setDetailError("");
              setState((s) => ({
                ...s,
                messages: s.messages.filter(
                  (message) => (message.context ?? "home") !== context,
                ),
              }));
              input.current?.focus();
            }}
          >
            {intent === "plan_meal"
              ? state.language === "fil"
                ? "Plano ng pagkain"
                : "Meal plan"
              : state.language === "fil"
                ? "Listahan ng mabibili"
                : "Shopping list"}
          </button>
        ))}
      </div>
      <p className="subtext">
        {state.language === "fil"
          ? "Bagong usapan kapag nagpalit ng feature. Nananatili ang buod sa Insights."
          : "Switching features starts a new chat. Your latest conclusions stay in Insights."}
      </p>
      <div className="chat-ai-status" role="status" aria-live="polite">
        <span>
          {aiStartup.starting
            ? state.language === "fil"
              ? "Sinisimulan ang Ollama…"
              : "Starting Ollama…"
            : aiStartup.message}
        </span>
        {!aiStartup.starting && !aiStartup.ready && (
          <button
            type="button"
            onClick={() => setStartupAttempt((value) => value + 1)}
          >
            {state.language === "fil" ? "Subukang muli" : "Retry"}
          </button>
        )}
      </div>
      {planningMode ? (
        <section
          className="chat-context"
          aria-label={
            state.language === "fil"
              ? "Mga detalye mula sa Home"
              : "Home planning details"
          }
        >
          <div className="chat-context-values" role="status">
            <span>
              <small>{t("budget")}</small>
              <strong>PHP {state.budget}</strong>
            </span>
            <span>
              <small>{t("people")}</small>
              <strong>{state.people}</strong>
            </span>
            <span>
              <small>{t("days")}</small>
              <strong>{state.days}</strong>
            </span>
          </div>
          <p className="chat-context-note">
            {purpose === "buy_food"
              ? state.language === "fil"
                ? "Listahan gamit ang kabuuang badyet."
                : "Shopping list using your full budget."
              : purpose === "view_recipe"
                ? `PHP ${Math.floor((state.budget / state.days) * 100) / 100} ${state.language === "fil" ? "bawat araw" : "per day"}`
                : state.language === "fil"
                  ? `Kabuuang badyet para sa ${state.days} araw. Almusal, tanghalian at hapunan bawat araw.`
                  : `Total budget across ${state.days} days. Breakfast, lunch and dinner each day.`}
          </p>
          <p id="meal-chat-help" className="chat-context-note">
            {state.language === "fil"
              ? "Gagamitin ang mga detalye sa Home. Sabihin ang gusto mong pagkain, bawal na sangkap o mga item na bibilhin."
              : "Home settings are your default. Ask ‘What if my budget is 300?’ to compare without changing your saved budget."}
          </p>
        </section>
      ) : (
        <section className="chat-context">
          <p id="meal-chat-help">
            {state.language === "fil"
              ? "Sabihin ang badyet mo, ilang tao at ilang araw. Halimbawa: ‘₱300 para sa 2 tao, 1 araw, walang isda.’"
              : feature === "buy_food"
                ? "Tell me your shopping budget and any foods you want. Try ‘400 pesos, list food I can buy.’"
                : "Tell me your budget, how many people and how many days. Try ‘₱300 for 2 people, 1 day, without fish.’ Meal plans include cooking steps."}
          </p>
        </section>
      )}
      <div className="chat-messages" role="log" aria-live="polite">
        {!conversation.length && <p className="subtext">{t("noMessages")}</p>}
        {conversation.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.role === "assistant" && <BrandImage kind="mascot" />}
            <div className="message-body">
              <p className="bubble">
                {message.localPlan
                  ? message.planRequest?.scenario_budget_php != null
                    ? message.text
                    : planReply(message.localPlan, state.language)
                  : message.key
                    ? t(message.key)
                    : message.text}
              </p>
              {message.recipe && (
                <section
                  aria-label={
                    state.language === "fil"
                      ? "Mga hakbang ng recipe"
                      : "Recipe cooking steps"
                  }
                >
                  <h3>{message.recipe.name}</h3>
                  <ol>
                    {message.recipe.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </section>
              )}
              {message.localPlan?.schedule?.length ? (
                <MealSchedule
                  plan={message.localPlan}
                  language={state.language}
                  t={t}
                  disabled={pending || aiStartup.starting}
                  onToggleMeal={
                    message.planRequest && message.id === latestScheduleId
                      ? (day, meal_type, skip) => {
                          const request = message.planRequest!;
                          const skipped_meals = (
                            request.skipped_meals ?? []
                          ).filter(
                            (meal) =>
                              meal.day !== day || meal.meal_type !== meal_type,
                          );
                          if (skip) skipped_meals.push({ day, meal_type });
                          void send(
                            `${skip ? "Skip" : "Include"} ${meal_type} on Day ${day}`,
                            {
                              ...request,
                              intent: "plan_meal",
                              skipped_meals,
                              clarification_question: null,
                            },
                          );
                        }
                      : undefined
                  }
                  onAdd={onAdd}
                  onAlternatives={
                    message.planRequest && message.id === latestScheduleId
                      ? async (day, meal_type, recipe_id) => {
                          const request = message.planRequest!;
                          const result = await generatePlan(
                            {
                              ...state,
                              budget: request.budget_php ?? state.budget,
                              people: request.servings ?? state.people,
                              days: request.days ?? state.days,
                              pantry: request.pantry_empty ? [] : state.pantry,
                            },
                            request.scenario_budget_php ??
                              request.budget_php ??
                              state.budget,
                            request,
                            undefined,
                            {
                              target_day: day,
                              target_meal_type: meal_type,
                              exclude_recipe_id: recipe_id,
                            },
                          );
                          return result.plan.meal_alternatives ?? [];
                        }
                      : undefined
                  }
                  onChooseAlternative={
                    message.planRequest && message.id === latestScheduleId
                      ? (alternative: MealAlternative) => {
                          const id = crypto.randomUUID();
                          const request = {
                            ...message.planRequest!,
                            meal_choices: alternative.meal_choices,
                          };
                          const insight = summarizePlan(
                            alternative.plan,
                            id,
                            request.servings ?? 1,
                            request.days ?? 1,
                          );
                          setState((s) => ({
                            ...s,
                            messages: [
                              ...s.messages,
                              {
                                id: crypto.randomUUID(),
                                role: "user",
                                text: `Use ${alternative.recipe_name}`,
                                context,
                              },
                              {
                                id,
                                role: "assistant",
                                text: planReply(alternative.plan, s.language),
                                localPlan: alternative.plan,
                                planRequest: request,
                                context,
                              },
                            ],
                            planInsights: insight
                              ? {
                                  ...s.planInsights,
                                  [insight.feature]: insight,
                                }
                              : s.planInsights,
                          }));
                        }
                      : undefined
                  }
                  onDetails={(option) => {
                    setDetailError("");
                    void api<Recipe>(
                      `/recipes/${encodeURIComponent(option.recipe_id)}`,
                    )
                      .then((recipe) => onDetails(recipe, option))
                      .catch(() =>
                        setDetailError(
                          "Could not load the recipe. Try again when the backend is available.",
                        ),
                      );
                  }}
                />
              ) : null}
              {message.localPlan &&
                !message.localPlan.schedule?.length &&
                !message.localPlan.options.length && (
                  <div className="reply-suggestions">
                    {!message.localPlan.basic_food && (
                      <button
                        className="chat-suggestion"
                        disabled={pending}
                        onClick={() =>
                          void send(
                            state.language === "fil"
                              ? "Ano ang mabibili kong pagkain sa badyet ko?"
                              : "What food can I buy within my budget?",
                            {
                              ...message.planRequest!,
                              intent: "buy_food",
                              budget_php: planningMode
                                ? state.budget
                                : (message.planRequest?.budget_php ?? null),
                              servings: planningMode
                                ? state.people
                                : (message.planRequest?.servings ?? 1),
                              excluded_ingredients:
                                message.planRequest?.excluded_ingredients ?? [],
                              meal_type: null,
                              max_prep_minutes: null,
                              clarification_question: null,
                              confidence_note: "Basic food shopping",
                            },
                          )
                        }
                      >
                        {state.language === "fil"
                          ? "Simpleng pagkain sa badyet ko"
                          : "Basic food within my budget"}
                      </button>
                    )}
                  </div>
                )}
              {message.localPlan && message.localPlan.options.length > 0 && (
                <div className="plan-summary">
                  {message.localPlan.options.map((option) => (
                    <div key={option.recipe_id}>
                      <h3>{option.recipe_name}</h3>
                      {!message.localPlan?.shopping_list && (
                        <p>
                          {option.servings} servings · PHP{" "}
                          {option.estimated_total_php.toFixed(2)}
                        </p>
                      )}
                      {message.localPlan?.shopping_list && (
                        <p>
                          Total: PHP {option.estimated_total_php.toFixed(2)}
                        </p>
                      )}
                      <p>Remaining: PHP {option.remaining_php.toFixed(2)}</p>
                      {option.warnings?.map((warning, index) => (
                        <p className="notice" key={index}>
                          {warning}
                        </p>
                      ))}
                      {!!option.steps?.length && (
                        <details className="cooking-steps">
                          <summary>
                            {state.language === "fil"
                              ? "Mga hakbang sa pagluluto"
                              : "Cooking steps"}
                          </summary>
                          <ol>
                            {option.steps.map((step, index) => (
                              <li key={index}>{step}</li>
                            ))}
                          </ol>
                        </details>
                      )}
                      {(message.localPlan?.basic_food ||
                        message.localPlan?.shopping_list) &&
                        option.items_to_buy.map((item) => (
                          <div
                            className="shopping-plan-item"
                            key={item.ingredient_id}
                          >
                            <p>
                              {item.name}: {item.quantity} {item.unit} · PHP{" "}
                              {item.cost_php.toFixed(2)}
                            </p>
                            {message.localPlan?.shopping_list &&
                              message.id === latestPlanId && (
                                <button
                                  type="button"
                                  disabled={pending}
                                  aria-label={`Remove ${item.name} from shopping list`}
                                  onClick={() => {
                                    setState((s) => {
                                      const current = s.messages.find(
                                        (entry) => entry.id === message.id,
                                      );
                                      if (!current?.localPlan) return s;
                                      const original = current.localPlan;
                                      const selected = original.options.find(
                                        (entry) =>
                                          entry.recipe_id === option.recipe_id,
                                      );
                                      const removed =
                                        selected?.items_to_buy.find(
                                          (entry) =>
                                            entry.ingredient_id ===
                                            item.ingredient_id,
                                        );
                                      if (!selected || !removed) return s;
                                      const items =
                                        selected.items_to_buy.filter(
                                          (entry) =>
                                            entry.ingredient_id !==
                                            item.ingredient_id,
                                        );
                                      const spent =
                                        Math.round(
                                          items.reduce(
                                            (sum, entry) =>
                                              sum + entry.cost_php,
                                            0,
                                          ) * 100,
                                        ) / 100;
                                      const remaining =
                                        Math.round(
                                          (original.budget_php - spent) * 100,
                                        ) / 100;
                                      const plan = {
                                        ...original,
                                        options: [
                                          {
                                            ...selected,
                                            items_to_buy: items,
                                            estimated_total_php: spent,
                                            remaining_php: remaining,
                                          },
                                        ],
                                        total_spent_php: spent,
                                        remaining_total_php: remaining,
                                        removed_cost_php:
                                          Math.round(
                                            ((original.removed_cost_php ?? 0) +
                                              removed.cost_php) *
                                              100,
                                          ) / 100,
                                      };
                                      const insight = summarizePlan(
                                        plan,
                                        current.id,
                                        current.planRequest?.servings ?? 1,
                                        current.planRequest?.days ?? 1,
                                      );
                                      return {
                                        ...s,
                                        messages: s.messages.map((entry) =>
                                          entry.id === current.id
                                            ? {
                                                ...entry,
                                                localPlan: plan,
                                                text: planReply(
                                                  plan,
                                                  s.language,
                                                ),
                                                planRequest: entry.planRequest
                                                  ? {
                                                      ...entry.planRequest,
                                                      shopping_items: items.map(
                                                        (entry) => ({
                                                          term: entry.name,
                                                          quantity:
                                                            entry.quantity,
                                                          unit: entry.unit,
                                                        }),
                                                      ),
                                                    }
                                                  : undefined,
                                              }
                                            : entry,
                                        ),
                                        planInsights: insight
                                          ? {
                                              ...s.planInsights,
                                              [insight.feature]: insight,
                                            }
                                          : s.planInsights,
                                      };
                                    });
                                  }}
                                >
                                  {state.language === "fil"
                                    ? "Alisin"
                                    : "Remove"}
                                </button>
                              )}
                          </div>
                        ))}
                      {!message.localPlan?.basic_food &&
                        !message.localPlan?.shopping_list && (
                          <button
                            onClick={() => {
                              setDetailError("");
                              void api<Recipe>(
                                `/recipes/${encodeURIComponent(option.recipe_id)}`,
                              )
                                .then((recipe) => onDetails(recipe, option))
                                .catch(() =>
                                  setDetailError(
                                    "Could not load the recipe. Try again when the backend is available.",
                                  ),
                                );
                            }}
                          >
                            {t("details")}
                          </button>
                        )}
                      {onAdd && (
                        <button onClick={() => onAdd(option)}>
                          {t("addGrocery")}
                        </button>
                      )}
                      <PlanConclusion
                        insight={summarizePlan(
                          message.localPlan!,
                          message.id,
                          message.planRequest?.servings ?? 1,
                          message.planRequest?.days ?? 1,
                        )!}
                        language={state.language}
                        label={
                          message.localPlan?.shopping_list
                            ? "Shopping budget summary"
                            : "Plan budget summary"
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              {message.localPlan &&
                !message.localPlan.options.length &&
                !message.localPlan.schedule?.length && (
                  <PlanConclusion
                    insight={summarizePlan(
                      message.localPlan,
                      message.id,
                      message.planRequest?.servings ?? 1,
                      message.planRequest?.days ?? 1,
                    )!}
                    language={state.language}
                  />
                )}
              {message.plan && (
                <PlanSummary
                  t={t}
                  onDetails={() => onDetails()}
                  language={state.language}
                />
              )}
            </div>
          </div>
        ))}
        {pending && (
          <p role="status">
            {state.language === "fil"
              ? "Nagkakalkula..."
              : "Calculating locally..."}
          </p>
        )}
        <div ref={end} className="chat-scroll-end" />
      </div>
      {detailError && <p role="alert">{detailError}</p>}
      <details className="chat-examples">
        <summary>
          {state.language === "fil"
            ? "Mga halimbawang mensahe"
            : "Try an example"}
        </summary>
        <div className="chat-prompts">
          {[
            { en: "Dinner without fish", fil: "Hapunan na walang isda" },
            { en: "Show me a dinner recipe", fil: "Recipe para sa hapunan" },
            { en: "Buy 3 pieces of eggs", fil: "Bumili ng 3 pirasong itlog" },
            {
              en: "Dinner within 20 minutes",
              fil: "Hapunan within 20 minutes",
            },
            { en: "My pantry is empty", fil: "Wala akong pagkain sa pantry" },
            {
              en: "What food can I buy within my budget?",
              fil: "Ano ang mabibili kong pagkain sa badyet ko?",
            },
          ].map((example) => (
            <button
              key={example.en}
              className="chat-suggestion"
              disabled={pending}
              onClick={() => {
                setDraft(state.language === "fil" ? example.fil : example.en);
                input.current?.focus();
              }}
            >
              {state.language === "fil" ? example.fil : example.en}
            </button>
          ))}
          <button
            className="chat-suggestion"
            disabled={pending}
            onClick={() =>
              void send(
                state.language === "fil"
                  ? "Magplano ng pagkain gamit ang aking badyet"
                  : planningMode
                    ? "Plan meals using my Home settings"
                    : "Plan meals using our conversation details",
              )
            }
          >
            {state.language === "fil"
              ? "Gamitin ang aking badyet"
              : "Plan with my settings"}
          </button>
          <button
            className="chat-suggestion"
            onClick={() => {
              setDraft(
                state.language === "fil"
                  ? "Ano ang maluluto ko gamit ang laman ng pantry?"
                  : "What can I cook with my pantry ingredients?",
              );
              input.current?.focus();
            }}
          >
            {t("pantryCheck")}
          </button>
        </div>
      </details>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={input}
          aria-label={t("ask")}
          aria-describedby="meal-chat-help"
          placeholder={t("ask")}
          maxLength={1500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          aria-label={t("send")}
          type="submit"
          disabled={pending || aiStartup.starting || !draft.trim()}
        >
          <Send />
        </button>
      </form>
    </Container>
  );
}
