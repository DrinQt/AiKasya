from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    PlanGenerateRequest,
    PlanGenerateResponse,
    PlanRepriceRequest,
    RecipeOption,
)
from app.database import get_all_recipes_db, get_recipe_by_id_db, get_latest_prices_map
from app.optimization.engine import plan_budget_to_meals, evaluate_recipe_affordability
from app.optimization.calculator import decimal_round

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.post("/generate", response_model=PlanGenerateResponse)
async def generate_plan(req: PlanGenerateRequest):
    all_recipes = get_all_recipes_db()
    prices_map = get_latest_prices_map()

    return plan_budget_to_meals(
        request=req,
        all_recipes=all_recipes,
        prices_map=prices_map,
    )


@router.post("/reprice", response_model=RecipeOption)
async def reprice_plan(req: PlanRepriceRequest):
    recipe = get_recipe_by_id_db(req.recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail=f"Recipe '{req.recipe_id}' not found.")

    prices_map = get_latest_prices_map()
    pantry_map = {item.ingredient_id.strip().lower(): (float(item.quantity), item.unit) for item in req.pantry}

    option, err = evaluate_recipe_affordability(
        recipe=recipe,
        target_servings=req.servings,
        pantry_map=pantry_map,
        prices_map=prices_map,
        excluded_ids=[],
    )

    if not option:
        raise HTTPException(status_code=400, detail=err or "Unable to reprice recipe.")

    option.remaining_php = decimal_round(req.budget_php - option.estimated_total_php, 2)
    return option
