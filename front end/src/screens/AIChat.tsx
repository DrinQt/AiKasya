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
import { Send } from "lucide-react";
import { BrandImage, PlanSummary, type T } from "../components";
import type { State } from "../state";
export default function AIChat({
  state,
  setState,
  t,
  onDetails,
}: {
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
  }, []);
  const [detailError, setDetailError] = useState("");
  const [pending, setPending] = useState(false);
  const send = async (prompt = draft) => {
    const text = prompt.trim();
    if (!text || pending) return;
    const userId = crypto.randomUUID();
    setState((s) => ({
      ...s,
      messages: [...s.messages, { id: userId, role: "user", text }],
    }));
    setDraft("");
    setPending(true);
    let reply: import("../data").Message;
    try {
      const interpreted = await api<Interpretation>("/agent/interpret", {
        message: text,
        existing_constraints: {
          budget_php: state.budget / state.days,
          servings: state.people,
        },
      });
      if (interpreted.clarification_question) {
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: interpreted.clarification_question,
        };
      } else if (interpreted.intent !== "plan_meal") {
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            state.language === "fil"
              ? "Maaari akong maghanap ng pagkain ayon sa badyet. Para baguhin ang pantry o presyo, gamitin ang kaukulang screen."
              : "I can find meals within your budget. Use the pantry and grocery screens to edit your stock or prices.",
        };
      } else {
        const result = await generatePlan(
          state,
          interpreted.budget_php ?? state.budget / state.days,
          interpreted,
        );
        reply = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: [
            interpreted.confidence_note,
            ...result.warnings,
            result.plan.reason_if_no_match ??
              "Choose from these locally calculated meal options.",
          ].join("\n"),
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
  return (
    <main className="chat-screen">
      <p className="demo-label">
        {state.language === "fil"
          ? "Lokal na AI at pagkalkula ng badyet"
          : "Local AI interpretation and budget calculations"}
      </p>
      <div className="chat-messages" role="log" aria-live="polite">
        {!state.messages.length && <p className="subtext">{t("noMessages")}</p>}
        {state.messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.role === "assistant" && <BrandImage kind="mascot" />}
            <div className="message-body">
              <p className="bubble">
                {message.key ? t(message.key) : message.text}
              </p>
              {message.localPlan && (
                <div className="plan-summary">
                  {message.localPlan.options.map((option) => (
                    <div key={option.recipe_id}>
                      <h3>{option.recipe_name}</h3>
                      <p>
                        {option.servings} servings · PHP{" "}
                        {option.estimated_total_php.toFixed(2)}
                      </p>
                      <p>Remaining: PHP {option.remaining_php.toFixed(2)}</p>
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
          onClick={() => void send(t("chatPrompt"))}
        >
          {t("chatPrompt")}
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
    </main>
  );
}
