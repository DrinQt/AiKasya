from typing import List
from fastapi import APIRouter, HTTPException
from app.models.schemas import RecipeSummary, RecipeDetail, RecipeIngredientItem
from app.database import get_all_recipes_db, get_recipe_by_id_db

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


@router.get("", response_model=List[RecipeSummary])
async def list_recipes():
    recipes = get_all_recipes_db()
    return [
        RecipeSummary(
            recipe_id=r["recipe_id"],
            name=r["name"],
            category=r["category"],
            base_servings=r["base_servings"],
            prep_minutes=r["prep_minutes"],
            cook_minutes=r["cook_minutes"],
            source_title=r["source_title"],
            source_url_or_note=r["source_url_or_note"],
        )
        for r in recipes
    ]


@router.get("/{recipe_id}", response_model=RecipeDetail)
async def get_recipe(recipe_id: str):
    recipe = get_recipe_by_id_db(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail=f"Recipe '{recipe_id}' not found.")

    ingredients = [
        RecipeIngredientItem(
            ingredient_id=i["ingredient_id"],
            name=i.get("name", i["ingredient_id"]),
            quantity=i["quantity"],
            unit=i["unit"],
            optional=i.get("optional", False),
            substitutions=i.get("substitutions", []),
        )
        for i in recipe["ingredients"]
    ]

    return RecipeDetail(
        recipe_id=recipe["recipe_id"],
        name=recipe["name"],
        category=recipe["category"],
        base_servings=recipe["base_servings"],
        prep_minutes=recipe["prep_minutes"],
        cook_minutes=recipe["cook_minutes"],
        source_title=recipe["source_title"],
        source_url_or_note=recipe["source_url_or_note"],
        steps=recipe["steps"],
        ingredients=ingredients,
    )
