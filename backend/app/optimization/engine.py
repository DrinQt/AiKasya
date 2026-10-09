from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from app.optimization.calculator import (
    calculate_ingredient_shortfall,
    decimal_round,
)
from app.models.schemas import (
    PlanGenerateRequest,
    PlanGenerateResponse,
    RecipeOption,
    ItemToBuy,
    PantryItemUsed,
)


def evaluate_recipe_affordability(
    recipe: Dict[str, Any],
    target_servings: int,
    pantry_map: Dict[str, Tuple[float, str]],
    prices_map: Dict[str, Dict[str, Any]],
    excluded_ids: List[str],
) -> Tuple[Optional[RecipeOption], Optional[str]]:
    base_servings = recipe.get("base_servings", 4)
    scale_factor = target_servings / base_servings

    items_to_buy: List[ItemToBuy] = []
    pantry_items_used: List[PantryItemUsed] = []
    warnings: List[str] = []
    total_cost_decimal = Decimal("0.00")

    for ing in recipe.get("ingredients", []):
        ing_id = ing["ingredient_id"]
        ing_name = ing.get("name", ing_id)
        is_optional = ing.get("optional", False)

        sub_qty = sub_unit = None
        if ing_id in excluded_ids:
            if is_optional:
                continue
            safe = next((s for s in ing.get("substitution_details") or []
                         if s["ingredient_id"] not in excluded_ids and s["ingredient_id"] in prices_map), None)
            if not safe:
                return None, f"Requires excluded ingredient: {ing_name}"
            warnings.append(f"Substituted {ing_name} with {safe.get('name', safe['ingredient_id'])} because of your exclusions.")
            ing_id, ing_name = safe["ingredient_id"], safe.get("name", safe["ingredient_id"])
            sub_qty, sub_unit = float(safe["quantity"]), safe["unit"]

        base_qty = float(ing["quantity"]) if sub_qty is None else sub_qty
        req_qty = base_qty * scale_factor
        req_unit = ing["unit"] if sub_unit is None else sub_unit

        pantry_qty, pantry_unit = pantry_map.get(ing_id, (0.0, req_unit))

        if is_optional and pantry_qty <= 0:
            warnings.append(f"Optional, not included in cost: {ing_name}.")
            continue

        price_info = prices_map.get(ing_id)
        if not price_info:
            if is_optional:
                warnings.append(f"Optional ingredient '{ing_name}' omitted: no price data available.")
                continue
            return None, f"Missing price data for required ingredient: {ing_name}"

        purchase_inc = float(price_info.get("minimum_purchase_quantity", 0.0) or 0.0)

        to_buy_qty, pantry_used_qty, base_unit = calculate_ingredient_shortfall(
            required_qty=req_qty,
            required_unit=req_unit,
            pantry_available_qty=pantry_qty,
            pantry_unit=pantry_unit,
            purchase_increment=purchase_inc,
        )

        if pantry_used_qty > 0:
            pantry_items_used.append(
                PantryItemUsed(
                    ingredient_id=ing_id,
                    name=ing_name,
                    quantity=decimal_round(pantry_used_qty, 2),
                    unit=base_unit,
                )
            )

        if to_buy_qty > 0:
            norm_price = Decimal(str(price_info["normalized_price_per_base_unit"]))
            item_cost = (Decimal(str(to_buy_qty)) * norm_price).quantize(Decimal("0.01"))
            total_cost_decimal += item_cost

            display_qty = to_buy_qty
            display_unit = base_unit
            if base_unit == "g" and to_buy_qty >= 1000:
                display_qty = to_buy_qty / 1000.0
                display_unit = "kg"
            elif base_unit == "ml" and to_buy_qty >= 1000:
                display_qty = to_buy_qty / 1000.0
                display_unit = "L"

            items_to_buy.append(
                ItemToBuy(
                    ingredient_id=ing_id,
                    name=ing_name,
                    quantity=decimal_round(display_qty, 2),
                    unit=display_unit,
                    cost_php=float(item_cost),
                    price_source_type=price_info.get("source_type", "demo_seed"),
                    price_observed_at=price_info.get("observed_at", "2026-10-09"),
                )
            )

    total_cost_float = float(total_cost_decimal)

    return RecipeOption(
        recipe_id=recipe["recipe_id"],
        recipe_name=recipe["name"],
        servings=target_servings,
        prep_minutes=recipe.get("prep_minutes", 10),
        cook_minutes=recipe.get("cook_minutes", 20),
        estimated_total_php=decimal_round(total_cost_float, 2),
        remaining_php=0.0,
        items_to_buy=items_to_buy,
        pantry_items_used=pantry_items_used,
        warnings=warnings,
    ), None


def plan_budget_to_meals(
    request: PlanGenerateRequest,
    all_recipes: List[Dict[str, Any]],
    prices_map: Dict[str, Dict[str, Any]],
) -> PlanGenerateResponse:
    pantry_map: Dict[str, Tuple[float, str]] = {
        item.ingredient_id.strip().lower(): (float(item.quantity), item.unit)
        for item in request.pantry
    }
    excluded_ids = [ex.strip().lower() for ex in request.excluded_ingredient_ids]

    feasible_options: List[RecipeOption] = []
    unaffordable_options: List[Tuple[RecipeOption, float]] = []

    wanted_meal = (request.meal_type or "").strip().lower() or None
    wanted_meal = {"merienda": "snack", "meryenda": "snack"}.get(wanted_meal, wanted_meal)

    for recipe in all_recipes:
        recipe_meals = recipe.get("meal_types") or []
        if wanted_meal and recipe_meals and wanted_meal not in recipe_meals:
            continue
        if request.max_prep_minutes is not None:
            total_time = recipe.get("prep_minutes", 0) + recipe.get("cook_minutes", 0)
            if total_time > request.max_prep_minutes:
                continue

        option, skip_reason = evaluate_recipe_affordability(
            recipe=recipe,
            target_servings=request.servings,
            pantry_map=pantry_map,
            prices_map=prices_map,
            excluded_ids=excluded_ids,
        )

        if not option:
            continue

        remaining = request.budget_php - option.estimated_total_php
        option.remaining_php = decimal_round(remaining, 2)

        if option.estimated_total_php <= request.budget_php:
            feasible_options.append(option)
        else:
            unaffordable_options.append((option, option.estimated_total_php - request.budget_php))

    if not feasible_options:
        if unaffordable_options:
            closest = min(unaffordable_options, key=lambda x: x[1])
            closest_name = closest[0].recipe_name
            shortage = closest[1]
            reason = (
                f"No recipe in the local library meets all constraints within ₱{request.budget_php:,.2f}. "
                f"The closest meal was '{closest_name}' needing an estimated ₱{closest[0].estimated_total_php:,.2f} "
                f"(₱{shortage:,.2f} over budget). Try increasing budget, reducing servings, or adding on-hand pantry ingredients."
            )
        else:
            reason = "No recipe in the local database satisfies all constraints and exclusions."

        return PlanGenerateResponse(
            status="no_match",
            budget_php=request.budget_php,
            options=[],
            reason_if_no_match=reason,
        )

    def rank_score(opt: RecipeOption) -> float:
        pantry_score = len(opt.pantry_items_used) * 20.0
        cushion_score = opt.remaining_php * 0.5
        time_penalty = ((opt.prep_minutes or 0) + (opt.cook_minutes or 0)) * 0.2
        return pantry_score + cushion_score - time_penalty

    feasible_options.sort(key=rank_score, reverse=True)
    top_options = feasible_options[:3]

    return PlanGenerateResponse(
        status="feasible",
        budget_php=request.budget_php,
        options=top_options,
        reason_if_no_match=None,
    )
