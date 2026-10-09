import { useState, type Dispatch, type SetStateAction } from "react";
import { Lightbulb, Pencil, Check, ShoppingBasket } from "lucide-react";
import { Button, type T } from "../components";
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
  const [editing, setEditing] = useState(market);
  const total = state.groceries.reduce((sum, item) => sum + item.price, 0),
    purchased = state.groceries
      .filter((x) => x.checked)
      .reduce((sum, item) => sum + item.price, 0);
  return (
    <main className="screen-content grocery-content">
      <div className="grocery-tip">
        <Lightbulb />
        <p>{t(market ? "marketHint" : "groceryTip")}</p>
      </div>
      <div className="grocery-items">
        {state.groceries.length === 0 && (
          <p className="subtext">{t("emptyGrocery")}</p>
        )}
        {state.groceries.map((item) => (
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
      </div>
      <div className="total-card">
        <h3>{t("total")}</h3>
        <strong>{money(total)}</strong>
      </div>
      {market && (
        <div className="market-totals">
          <p>
            {t("purchaseTotal")}
            <strong>{money(purchased)}</strong>
          </p>
          <p>
            {t("remaining")}
            <strong>{money(state.budget - purchased)}</strong>
          </p>
        </div>
      )}
      <Button onClick={() => setEditing(!editing)}>
        {editing ? <Check /> : <Pencil />}
        {t(editing ? "done" : "editPrices")}
      </Button>
      {market ? (
        <p className="subtext">{t("marketLater")}</p>
      ) : (
        <button className="secondary-button" onClick={onMarket}>
          <ShoppingBasket size={19} />
          {t("market")}
        </button>
      )}
    </main>
  );
}
