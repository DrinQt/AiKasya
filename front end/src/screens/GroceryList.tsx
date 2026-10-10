import { useState, type Dispatch, type SetStateAction } from "react";
import { savePrices } from "../api";
import { Pencil, Check, ShoppingBasket } from "lucide-react";
import { Button, BrandImage, type T } from "../components";
import { categories, categoryOf, copy } from "../plannerUI";
import type { State } from "../state";
export default function GroceryList({
  state,
  setState,
  t,
  money,
  market = false,
  onMarket,
}: {
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  t: T;
  money: (n: number) => string;
  market?: boolean;
  onMarket: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [editing, setEditing] = useState(market);
  const total = state.groceries.reduce((sum, item) => sum + item.price, 0),
    purchased = state.groceries
      .filter((x) => x.checked)
      .reduce((sum, item) => sum + item.price, 0);
  const count = state.groceries.filter((x) => x.checked).length;
  const progress = state.groceries.length
    ? (count / state.groceries.length) * 100
    : 0;
  const label = (en: string, fil: string) => copy(state.language, en, fil);
  return (
    <main className="screen-content grocery-content">
      <section className="planner-hero">
        <span className="eyebrow">
          {label("YOUR MARKET COMPANION", "KASAMA SA PAMIMILI")}
        </span>
        <h2>
          {label("A little list. A smarter shop.", "May listahan, may plano.")}
        </h2>
        <div className="summary-line">
          <span>
            {count} / {state.groceries.length} {t("purchased").toLowerCase()}
          </span>
          <strong>
            {state.groceries.length - count} {label("left", "natitira")}
          </strong>
        </div>
        <div
          className="mini-progress"
          role="progressbar"
          aria-label={t("purchased")}
          aria-valuemin={0}
          aria-valuemax={state.groceries.length || 1}
          aria-valuenow={count}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>
      <div className="grocery-tip">
        <BrandImage kind="mascot" className="context-mascot" />

        <p>{t(market ? "marketHint" : "groceryTip")}</p>
      </div>
      <div className="grocery-items">
        {state.groceries.length === 0 && (
          <p className="subtext">{t("emptyGrocery")}</p>
        )}
        {categories.map((category) => {
          const items = state.groceries.filter(
            (item) => categoryOf(item) === category.id,
          );
          if (!items.length) return null;
          return (
            <section className="grocery-group" key={category.id}>
              <h2 className="category-heading">
                <span aria-hidden="true">{category.icon}</span>
                {state.language === "fil" ? category.fil : category.en}
                <small>{items.length}</small>
              </h2>
              {items.map((item) => (
                <div
                  className={`grocery-row ${item.checked ? "checked" : ""}`}
                  key={item.id}
                >
                  <label className="grocery-check">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          groceries: s.groceries.map((x) =>
                            x.id === item.id
                              ? { ...x, checked: e.target.checked }
                              : x,
                          ),
                        }))
                      }
                    />
                    <span className="check-decoration" aria-hidden="true">
                      {item.checked && <Check size={17} />}
                    </span>
                    <span>
                      {state.language === "fil" ? item.fil : item.name}{" "}
                      <small>({item.quantity})</small>
                    </span>
                  </label>
                  {editing ? (
                    <label className="price-label">
                      <span>₱</span>
                      <input
                        aria-label={`${t("price")} — ${state.language === "fil" ? item.fil : item.name}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="1000000"
                        step="0.01"
                        value={item.price}
                        onChange={(e) => {
                          const price = Number(e.target.value);
                          if (
                            Number.isFinite(price) &&
                            price >= 0 &&
                            price <= 1000000
                          )
                            setState((s) => ({
                              ...s,
                              groceries: s.groceries.map((x) =>
                                x.id === item.id ? { ...x, price } : x,
                              ),
                            }));
                        }}
                      />
                    </label>
                  ) : (
                    <strong>{money(item.price)}</strong>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <div className="shopping-dock">
        <div className="total-card">
          <h3>{t("total")}</h3>
          <strong>{money(total)}</strong>
        </div>
        <div className="market-totals">
          {market && (
            <p>
              {t("purchaseTotal")}
              <strong>{money(purchased)}</strong>
            </p>
          )}
          <p
            className={
              state.budget - (market ? purchased : total) < 0
                ? "amount-over"
                : ""
            }
          >
            {t("remaining")}
            <strong>
              {money(state.budget - (market ? purchased : total))}
            </strong>
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
        >
          {editing ? <Check size={18} /> : <Pencil size={18} />}
          {t(editing ? "done" : "editPrices")}
        </button>
        {!market && (
          <Button onClick={onMarket}>
            <ShoppingBasket size={20} />
            {t("market")}
          </Button>
        )}
      </div>
      <Button
        disabled={syncing}
        onClick={() => {
          setSyncing(true);
          setSyncNotice("");
          void savePrices(state)
            .then((result) =>
              setSyncNotice(
                `Saved ${result.saved} prices to the local backend. ${result.skipped} items skipped because their ingredient, quantity, unit, or price needs correction.`,
              ),
            )
            .catch(() =>
              setSyncNotice(
                "Could not save prices to the local backend. Device prices are still saved; retry when the service is available.",
              ),
            )
            .finally(() => setSyncing(false));
        }}
      >
        Save prices to backend
      </Button>
      {syncNotice && <p role="status">{syncNotice}</p>}
      {market && <p className="subtext">{t("marketLater")}</p>}
    </main>
  );
}
