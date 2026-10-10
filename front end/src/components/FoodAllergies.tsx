import { useState } from "react";
import { ShieldCheck, Plus, X } from "lucide-react";
import type { T } from "../components";
import {
  allergenIds,
  emptyAllergies,
  type AllergyPreferences,
} from "../allergies";

export default function FoodAllergies({
  value,
  onChange,
  t,
  title,
}: {
  title?: string;
  value: AllergyPreferences;
  onChange: (value: AllergyPreferences) => void;
  t: T;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const update = (next: AllergyPreferences) => {
    onChange(
      next.allergens.length || next.custom.length || next.other
        ? { ...next, status: "restricted" }
        : emptyAllergies(),
    );
    setMessage("");
  };
  const add = () => {
    const name = draft.trim();
    if (!name) {
      setMessage(t("allergyEmpty"));
      return;
    }
    const existing = [...value.custom, ...value.allergens.map((id) => t(id))];
    if (
      existing.some(
        (item) => item.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setMessage(t("allergyDuplicate"));
      return;
    }
    update({ ...value, other: true, custom: [...value.custom, name] });
    setDraft("");
  };
  return (
    <section className="allergy-card" aria-labelledby="allergy-title">
      <div className="allergy-heading">
        <ShieldCheck size={25} aria-hidden="true" />
        <div>
          <h2 id="allergy-title">{title ?? t("foodAllergies")}</h2>
          <p>{t("allergySubtitle")}</p>
        </div>
      </div>
      <fieldset className="allergy-options">
        <legend className="visually-hidden">{t("foodAllergies")}</legend>
        {allergenIds.map((id) => (
          <label className="allergy-chip" key={id}>
            <input
              type="checkbox"
              checked={value.allergens.includes(id)}
              onChange={(e) =>
                update({
                  ...value,
                  allergens: e.target.checked
                    ? [...value.allergens, id]
                    : value.allergens.filter((item) => item !== id),
                })
              }
            />
            <span>{t(id)}</span>
          </label>
        ))}
        <label className="allergy-chip">
          <input
            type="checkbox"
            checked={value.other}
            onChange={(e) => {
              update({
                ...value,
                other: e.target.checked,
                custom: e.target.checked ? value.custom : [],
              });
              setDraft("");
            }}
          />
          <span>{t("otherAllergy")}</span>
        </label>
      </fieldset>
      {value.other && (
        <div className="custom-allergy-editor">
          <label htmlFor="custom-allergy">{t("customIngredient")}</label>
          <div className="custom-allergy-input">
            <input
              id="custom-allergy"
              maxLength={60}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button
              type="button"
              onClick={add}
              aria-label={t("addCustomAllergy")}
            >
              <Plus size={18} />
            </button>
          </div>
          {message && (
            <p role="alert" className="error">
              {message}
            </p>
          )}
          <div className="custom-allergy-list">
            {value.custom.map((name) => (
              <span key={name}>
                {name}
                <button
                  type="button"
                  aria-label={`${t("removeItem")} — ${name}`}
                  onClick={() =>
                    update({
                      ...value,
                      custom: value.custom.filter((item) => item !== name),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <fieldset className="allergy-status">
        <legend className="visually-hidden">{t("allergyStatus")}</legend>
        {(["none", "unknown"] as const).map((status) => (
          <label className="allergy-chip" key={status}>
            <input
              type="radio"
              name="allergy-status"
              checked={value.status === status}
              onChange={() => {
                onChange(emptyAllergies(status));
                setDraft("");
                setMessage("");
              }}
            />
            <span>
              {t(status === "none" ? "noAllergies" : "unknownAllergies")}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="allergy-scope">{t("allergyHousehold")}</p>
    </section>
  );
}
