from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    PlanGenerateRequest,
    PlanGenerateResponse,
    PlanRepriceRequest,
    RecipeOption,
    MealAlternativesRequest,
    MealChoice,
)
from app.database import get_all_recipes_db, get_recipe_by_id_db, get_latest_prices_map, get_all_ingredients_db
from app.optimization.engine import plan_budget_to_meals, evaluate_recipe_affordability
from app.optimization.calculator import decimal_round
from app.allergy import resolve_exclusions, label_check_warnings
from app.optimization.shopping import shopping_plan
from app.optimization.schedule import daily_schedule

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.post("/alternatives", response_model=PlanGenerateResponse)
async def meal_alternatives(req: MealAlternativesRequest):
    if req.target_day > req.days or any(item.day == req.target_day and item.meal_type == req.target_meal_type for item in req.skipped_meals):
        raise HTTPException(status_code=422, detail="Choose an included meal within the planned days.")
    alternatives = []
    for recipe in get_all_recipes_db():
        if recipe["recipe_id"] == req.exclude_recipe_id or (recipe.get("meal_types") and req.target_meal_type not in recipe["meal_types"]):
            continue
        choices = [item for item in req.meal_choices if (item.day, item.meal_type) != (req.target_day, req.target_meal_type)]
        choices.append(MealChoice(day=req.target_day, meal_type=req.target_meal_type, recipe_id=recipe["recipe_id"]))
        candidate = PlanGenerateRequest(**{**req.model_dump(), "meal_scope": "day", "shopping_list": False, "basic_food": False, "meal_choices": choices})
        plan = await generate_plan(candidate)
        if plan.status != "feasible":
            continue
        option = plan.schedule[req.target_day - 1].meals[("breakfast", "lunch", "dinner").index(req.target_meal_type)].option
        if not option or option.recipe_id != recipe["recipe_id"]:
            continue
        alternatives.append({"recipe_id": option.recipe_id, "recipe_name": option.recipe_name,
            "cost_php": option.estimated_total_php, "plan": plan.model_dump(), "meal_choices": [item.model_dump() for item in choices]})
        if len(alternatives) == 3:
            break
    total = req.budget_php * req.days if req.budget_basis == "per_day" else req.budget_php
    return PlanGenerateResponse(status="feasible" if alternatives else "no_match", budget_php=total,
        meal_alternatives=alternatives, reason_if_no_match=None if alternatives else "No other complete meal plan fits this budget and restrictions.")


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
    if req.shopping_list:
        if req.budget_basis == "per_day":
            req = req.model_copy(update={"budget_php": req.budget_php * req.days, "budget_basis": "total"})
        result = shopping_plan(req, get_latest_prices_map(), req.excluded_ingredient_ids)
        for option in result.options:
            option.warnings.extend(label_check_warnings([i.ingredient_id for i in option.items_to_buy], bool(resolved["resolved"])))
        return result

    all_recipes = get_all_recipes_db()
    if req.basic_food:
        # Simple preparations, costed with the same purchase increments and exclusions as recipes.
        all_recipes = [
            {"recipe_id": "basic_" + protein, "name": name, "base_servings": 1,
             "prep_minutes": 0, "cook_minutes": 20,
             "ingredients": [
                 {"ingredient_id": "rice", "name": "Uncooked rice", "quantity": 100, "unit": "g"},
                 {"ingredient_id": protein, "name": label, "quantity": qty, "unit": unit},
             ]}
            for protein, name, label, qty, unit in [
                ("eggs", "Rice and boiled egg", "Egg", 1, "piece"),
                ("tomato", "Rice and tomato", "Tomato", 100, "g"),
            ]
        ]
    prices_map = get_latest_prices_map()

    if req.meal_scope == "day" and not req.basic_food:
        result = daily_schedule(req, all_recipes, prices_map, get_all_ingredients_db())
        for day in result.schedule:
            if day.extra_groceries:
                day.extra_groceries.warnings.extend(label_check_warnings([item.ingredient_id for item in day.extra_groceries.items_to_buy], bool(resolved["resolved"])))
            for meal in day.meals:
                if meal.option:
                    opt = meal.option
                    ids = [i.ingredient_id for i in opt.items_to_buy] + [p.ingredient_id for p in opt.pantry_items_used]
                    opt.warnings.extend(label_check_warnings(ids, bool(resolved["resolved"])))
        return result

    result = plan_budget_to_meals(
        request=req,
        all_recipes=all_recipes,
        prices_map=prices_map,
    )
    active = bool(resolved["resolved"])
    result.basic_food = req.basic_food
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
