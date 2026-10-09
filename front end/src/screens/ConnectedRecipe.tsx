import type { MealOption, Recipe } from "../api";
import { Button, type T } from "../components";
export default function ConnectedRecipe({
  recipe,
  option,
  t,
  onAdd,
}: {
  recipe: Recipe;
  option: MealOption;
  t: T;
  onAdd: () => void;
}) {
  const scale = option.servings / recipe.base_servings;
  return (
    <main className="screen-content">
      <h2>{recipe.name}</h2>
      <p>
        {option.servings} servings · {recipe.prep_minutes + recipe.cook_minutes}{" "}
        minutes
      </p>
      <h3>{t("ingredients")}</h3>
      <ul className="ingredient-list">
        {recipe.ingredients.map((item) => (
          <li key={item.ingredient_id}>
            {item.name}
            <span>
              {Number((item.quantity * scale).toFixed(2))} {item.unit}
            </span>
          </li>
        ))}
      </ul>
      <h3>{t("instructions")}</h3>
      <ol>
        {recipe.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="subtext">
        Source: {recipe.source_title} · {recipe.source_url_or_note}
      </p>
      <Button onClick={onAdd}>{t("addGrocery")}</Button>
    </main>
  );
}
