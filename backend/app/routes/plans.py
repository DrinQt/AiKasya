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
from app.allergy import resolve_exclusions, label_check_warnings

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.post("/generate", response_model=PlanGenerateResponse)
async def generate_plan(req: PlanGenerateRequest):
    # Exclusions may be ingredient ids OR words ("shrimp", "hipon", "isda", "baboy"); expand allergen groups.
    resolved = resolve_exclusions(req.excluded_ingredient_ids)
    if resolved["unknown"]:
        return PlanGenerateResponse(
            status="invalid_request",
            budget_php=req.budget_php,
            options=[],
            reason_if_no_match=(
                "Please clarify these allergies/exclusions so we can keep you safe: "
                + ", ".join(resolved["unknown"])
                + ". Use an ingredient or allergen name such as shrimp, fish, egg, peanut, soy, milk or wheat."
            ),
        )
    req = req.model_copy(update={"excluded_ingredient_ids": resolved["excluded_ingredient_ids"]})

    all_recipes = get_all_recipes_db()
    prices_map = get_latest_prices_map()

    result = plan_budget_to_meals(
        request=req,
        all_recipes=all_recipes,
        prices_map=prices_map,
    )
    active = bool(resolved["resolved"])
    for opt in result.options:
        ids = [i.ingredient_id for i in opt.items_to_buy] + [p.ingredient_id for p in opt.pantry_items_used]
        opt.warnings.extend(label_check_warnings(ids, active))
    return result


@router.post("/reprice", response_model=RecipeOption)
async def reprice_plan(req: PlanRepriceRequest):
    recipe = get_recipe_by_id_db(req.recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail=f"Recipe '{req.recipe_id}' not found.")

    prices_map = get_latest_prices_map()
    pantry_map = {item.ingredient_id.strip().lower(): (float(item.quantity), item.unit) for item in req.pantry}

    resolved = resolve_exclusions(req.excluded_ingredient_ids)
    if resolved["unknown"]:
        raise HTTPException(status_code=422, detail="Please clarify: " + ", ".join(resolved["unknown"]))

    option, err = evaluate_recipe_affordability(
        recipe=recipe,
        target_servings=req.servings,
        pantry_map=pantry_map,
        prices_map=prices_map,
        excluded_ids=resolved["excluded_ingredient_ids"],
    )

    if not option:
        raise HTTPException(status_code=400, detail=err or "Unable to reprice recipe.")

    option.remaining_php = decimal_round(req.budget_php - option.estimated_total_php, 2)
    ids = [i.ingredient_id for i in option.items_to_buy] + [p.ingredient_id for p in option.pantry_items_used]
    option.warnings.extend(label_check_warnings(ids, bool(resolved["resolved"])))
    return option
