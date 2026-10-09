import { useState, type Dispatch, type SetStateAction } from "react";
import { api, savePantry } from "../api";
import { Plus, Check, X, Sparkles } from "lucide-react";
import { Button, MascotTip, type T } from "../components";
import type { State } from "../state";
export default function Pantry({
  state,
  setState,
  t,
  onSuggest,
}: {
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  t: T;
  onSuggest: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  return (
    <main className="screen-content pantry-content">
      <div className="backend-actions">
        <Button
          disabled={syncing}
          onClick={() => {
            setSyncing(true);
            setSyncNotice("");
            void savePantry(state)
              .then(() => setSyncNotice("Pantry saved to the local backend."))
              .catch((error) =>
                setSyncNotice(
                  error instanceof Error
                    ? error.message
                    : "Could not save pantry. Your device copy is unchanged.",
                ),
              )
              .finally(() => setSyncing(false));
          }}
        >
          Save pantry to backend
        </Button>
        <Button
          disabled={syncing}
          onClick={() => {
            setSyncing(true);
            setSyncNotice("");
            void api<
              {
                ingredient_id: string;
                name: string;
                quantity: number;
                unit: string;
              }[]
            >("/pantry")
              .then((items) => {
                setState((s) => ({
                  ...s,
                  pantry: items
                    .filter((item) => item.quantity > 0)
                    .map((item) => ({
                      id: item.ingredient_id,
                      name: item.name,
                      quantity: `${item.quantity} ${item.unit}`,
                      emoji: "\u{1F96C}",
                    })),
                }));
                setSyncNotice("Loaded the local backend pantry.");
              })
              .catch(() =>
                setSyncNotice(
                  "Could not load the local pantry. Your device copy is unchanged.",
                ),
              )
              .finally(() => setSyncing(false));
          }}
        >
          Load backend pantry
        </Button>
      </div>
      {syncNotice && <p role="status">{syncNotice}</p>}
      <section>
        <h2 className="pantry-heading">{t("have")}</h2>
        {state.pantry.length === 0 && (
          <p className="subtext">{t("noPantry")}</p>
        )}
        <div className="pantry-grid">
          {state.pantry.map((item) => (
            <article className="pantry-card" key={item.id}>
              <button
                className="remove-item"
                aria-label={`${t("removeItem")} — ${state.language === "fil" ? (item.fil ?? item.name) : item.name}`}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    pantry: s.pantry.filter((x) => x.id !== item.id),
                  }))
                }
              >
                <X size={13} />
              </button>
              <span className="ingredient-emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <h3>
                {state.language === "fil" ? (item.fil ?? item.name) : item.name}
              </h3>
              <small>{item.quantity}</small>
              <span className="available-check" aria-label={t("available")}>
                <Check size={13} />
              </span>
            </article>
          ))}
          <button
            className="pantry-card add-pantry"
            onClick={() => setAdding(!adding)}
            aria-expanded={adding}
          >
            <Plus size={28} />
            <strong>{t("addItem")}</strong>
          </button>
        </div>
      </section>
      {adding && (
        <form
          className="item-form simple-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !quantity.trim()) return;
            setState((s) => ({
              ...s,
              pantry: [
                ...s.pantry,
                {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  quantity: quantity.trim(),
                  emoji: "🥬",
                },
              ],
            }));
            setName("");
            setQuantity("");
            setAdding(false);
          }}
        >
          <label>
            {t("itemName")}
            <input
              autoFocus
              required
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {t("quantity")}
            <input
              required
              maxLength={30}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <Button type="submit">
            <Plus size={19} />
            {t("add")}
          </Button>
        </form>
      )}
      <MascotTip>{t("pantryTip")}</MascotTip>
      <Button onClick={onSuggest}>
        <Sparkles className="yellow" />
        {t("suggest")}
      </Button>
    </main>
  );
}
