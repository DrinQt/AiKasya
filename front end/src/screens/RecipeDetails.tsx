import { recipes, groceries } from "../data";
import { Button, type T } from "../components";
export default function RecipeDetails({
  recipeId,
  language,
  t,
  onAdd,
}: {
  recipeId: string;
  language: "en" | "fil";
  t: T;
  onAdd: () => void;
}) {
  const recipe = recipes.find((x) => x.id === recipeId) ?? recipes[0];
  return (
    <main className="screen-content">
      <div className={`recipe-hero food-thumb ${recipe.id}`} aria-hidden="true">
        <img src={`/assets/${recipe.id}.jpg`} alt="" />
      </div>
      <h2>{recipe.name}</h2>
      <p className="subtext">{t("recipeServings")}</p>
      <h3>{t("ingredients")}</h3>
      <ul className="ingredient-list">
        {recipe.ingredientIds.map((id) => {
          const item = groceries.find((x) => x.id === id)!;
          return (
            <li key={id}>
              {language === "fil" ? item.fil : item.name}{" "}
              <span>{item.quantity}</span>
            </li>
          );
        })}
      </ul>
      <div className="simple-card">
        <h3>{t("instructions")}</h3>
        <p>{t("recipeLater")}</p>
      </div>
      <Button onClick={onAdd}>{t("addGrocery")}</Button>
    </main>
  );
}
