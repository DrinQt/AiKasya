import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
  onDetails: () => void;
}) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [state.messages.length]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const send = (prompt = draft) => {
    const text = prompt.trim();
    if (!text) return;
    setState((s) => ({
      ...s,
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role: "user", text },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          key: "chatReply",
          plan: true,
        },
      ],
    }));
    setDraft("");
  };
  return (
    <main className="chat-screen">
      <p className="demo-label">{t("mockNotice")}</p>
      <div className="chat-messages" role="log" aria-live="polite">
        {!state.messages.length && <p className="subtext">{t("noMessages")}</p>}
        {state.messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.role === "assistant" && <BrandImage kind="mascot" />}
            <div className="message-body">
              <p className="bubble">
                {message.key ? t(message.key) : message.text}
              </p>
              {message.plan && <PlanSummary t={t} onDetails={onDetails} language={state.language} />}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chat-prompts">
        <button className="chat-suggestion" onClick={() => send(t("chatPrompt"))}>{t("chatPrompt")}</button>
        <button className="chat-suggestion" onClick={() => { setDraft(state.language === "fil" ? "Ano ang maluluto ko gamit ang laman ng pantry?" : "What can I cook with my pantry ingredients?"); input.current?.focus(); }}>{t("pantryCheck")}</button>
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
        <button aria-label={t("send")} type="submit" disabled={!draft.trim()}>
          <Send />
        </button>
      </form>
    </main>
  );
}
