import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  api,
  generatePlan,
  type Interpretation,
  type MealOption,
  type Recipe,
} from "../api";
import { closestMeal, planReply } from "../chatPresentation";
import { Send } from "lucide-react";
import { BrandImage, PlanSummary, type T } from "../components";
import type { State } from "../state";
export default function AIChat({
  state,
  setState,
  t,
  onDetails,
  embedded = false,
}: {
  embedded?: boolean;
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  t: T;
  onDetails: (recipe?: Recipe, option?: MealOption) => void;
}) {
  const [draft, setDraft] = useState("");
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
  const send = async (prompt = draft, constraints?: Interpretation) => {
    const text = prompt.trim();
    if (!text || pending) return;
    const budgetMatch =
      text.match(/(\d+(?:\.\d+)?)\s*(?:budget|pesos?|php)/i) ??
      text.match(/(?:budget|php|₱)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i) ??
      text.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    const daysMatch = text.match(/(\d+)\s*(?:days?\b|araw\b)/i);
    const oneDay = /\b(?:isang araw|one day|a day)\b/i.test(text);
    const peopleMatch = text.match(
      /(\d+)\s*(?:people|persons?|servings?|tao|pax)\b/i,
    );
    const amount = budgetMatch ? Number(budgetMatch[1]) : state.budget;
    const days = daysMatch ? Number(daysMatch[1]) : oneDay ? 1 : state.days;
    const people = peopleMatch ? Number(peopleMatch[1]) : state.people;
    const planningState = constraints
      ? {
          ...state,
          budget: constraints.budget_php ?? state.budget,
          people: constraints.servings ?? state.people,
        }
      : {
          ...state,
          budget: amount > 0 && amount <= 10000000 ? amount : state.budget,
          days: days >= 1 && days <= 30 ? days : state.days,
          people: people >= 1 && people <= 20 ? people : state.people,
        };
    const userId = crypto.randomUUID();
    setState((s) => ({
      ...s,
      budget: planningState.budget,
      people: planningState.people,
      days: planningState.days,
      messages: [...s.messages, { id: userId, role: "user", text }],
    }));
    setDraft("");
    setPending(true);
    let reply: import("../data").Message;
    try {
      const parsed =
        constraints ??
        (await api<Interpretation>("/agent/interpret", {
          message: text,
          existing_constraints: {
            budget_php: planningState.budget,
            servings: planningState.people,
          },
        }));
      const previousRequest = [...state.messages]
        .reverse()
        .find((message) => message.planRequest)?.planRequest;
      const interpreted = {
        ...parsed,
        budget_php: planningState.budget,
        servings: planningState.people,
        excluded_ingredients: [
          ...new Set([
            ...(previousRequest?.excluded_ingredients ?? []),
            ...parsed.excluded_ingredients,
          ]),
        ],
        clarification_question:
          parsed.clarification_question &&
          !parsed.clarification_question.toLowerCase().includes("budget") &&
          !parsed.clarification_question.toLowerCase().includes("badyet")
            ? parsed.clarification_question
            : null,
      };
      if (interpreted.clarification_question) {
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: interpreted.clarification_question,
        };
      } else if (!["plan_meal", "buy_food"].includes(interpreted.intent)) {
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            state.language === "fil"
              ? "Maaari akong maghanap ng pagkain ayon sa badyet. Para baguhin ang pantry o presyo, gamitin ang kaukulang screen."
              : "I can find meals within your budget. Use the pantry and grocery screens to edit your stock or prices.",
        };
      } else {
        if (interpreted.pantry_empty) {
          planningState.pantry = [];
          setState((s) => ({ ...s, pantry: [] }));
        }
        const result = await generatePlan(
          planningState,
          planningState.budget,
          interpreted,
        );
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: planReply(result.plan, state.language),
          planRequest: {
            ...interpreted,
            budget_php: result.plan.budget_php,
            servings: interpreted.servings ?? state.people,
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
    setState((s) =>
      s.messages.some((message) => message.id === userId)
        ? { ...s, messages: [...s.messages, reply] }
        : s,
    );
  };
  const Container = embedded ? "div" : "main";
  return (
    <Container className="chat-screen">
      <p className="demo-label">
        {state.language === "fil"
          ? "Kaagapay sa badyet sa pagkain"
          : "Your meal budget buddy"}
      </p>
      <p className="demo-label" role="status">
        PHP {state.budget} · {state.people} {t("people")} · {state.days}{" "}
        {t("days")}
        <br />
        PHP {Number((state.budget / state.days).toFixed(2))}{" "}
        {state.language === "fil" ? "bawat araw" : "per day"}
      </p>
      <div className="chat-messages" role="log" aria-live="polite">
        {!state.messages.length && <p className="subtext">{t("noMessages")}</p>}
        {state.messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.role === "assistant" && <BrandImage kind="mascot" />}
            <div className="message-body">
              <p className="bubble">
                {message.localPlan
                  ? planReply(message.localPlan, state.language)
                  : message.key
                    ? t(message.key)
                    : message.text}
              </p>
              {message.localPlan && !message.localPlan.options.length && (
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
                            budget_php: message.localPlan!.budget_php,
                            servings:
                              message.planRequest?.servings ?? state.people,
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
                  {closestMeal(message.localPlan) && (
                    <button
                      className="chat-suggestion"
                      disabled={pending}
                      onClick={() => {
                        const closest = closestMeal(message.localPlan!)!;
                        const request = message.planRequest;
                        const prompt = `${closest.cost} pesos for ${request?.servings ?? state.people} people`;
                        void send(
                          prompt,
                          request
                            ? {
                                ...request,
                                budget_php: closest.cost,
                                clarification_question: null,
                              }
                            : undefined,
                        );
                      }}
                    >
                      {state.language === "fil" ? "Gamitin ang" : "Use"} PHP{" "}
                      {closestMeal(message.localPlan)!.cost}{" "}
                      {state.language === "fil" ? "na badyet" : "budget"}
                    </button>
                  )}
                  {(message.planRequest?.servings ?? state.people) > 1 && (
                    <button
                      className="chat-suggestion"
                      disabled={pending}
                      onClick={() => {
                        const request = message.planRequest;
                        const servings = Math.max(
                          1,
                          (request?.servings ?? state.people) - 1,
                        );
                        void send(
                          `${message.localPlan!.budget_php} pesos for ${servings} people`,
                          request
                            ? {
                                ...request,
                                servings,
                                clarification_question: null,
                              }
                            : undefined,
                        );
                      }}
                    >
                      {state.language === "fil"
                        ? "Bawasan ang tao"
                        : "Try fewer people"}
                    </button>
                  )}
                </div>
              )}
              {message.localPlan && message.localPlan.options.length > 0 && (
                <div className="plan-summary">
                  {message.localPlan.options.map((option) => (
                    <div key={option.recipe_id}>
                      <h3>{option.recipe_name}</h3>
                      <p>
                        {option.servings} servings · PHP{" "}
                        {option.estimated_total_php.toFixed(2)}
                      </p>
                      <p>Remaining: PHP {option.remaining_php.toFixed(2)}</p>
                      {message.localPlan?.basic_food &&
                        option.items_to_buy.map((item) => (
                          <p key={item.ingredient_id}>
                            {item.name}: {item.quantity} {item.unit} · PHP{" "}
                            {item.cost_php.toFixed(2)}
                          </p>
                        ))}
                      {!message.localPlan?.basic_food && (
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
                    </div>
                  ))}
                </div>
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
        <div ref={end} />
      </div>
      {detailError && <p role="alert">{detailError}</p>}
      <div className="chat-prompts">
        <button
          className="chat-suggestion"
          disabled={pending}
          onClick={() =>
            void send(
              state.language === "fil"
                ? "Magplano ng pagkain gamit ang aking badyet"
                : "Plan meals using my Home settings",
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
          placeholder={t("ask")}
          maxLength={1500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          aria-label={t("send")}
          type="submit"
          disabled={pending || !draft.trim()}
        >
          <Send />
        </button>
      </form>
    </Container>
  );
}
