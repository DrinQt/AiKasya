"""Food baskets use current database prices and real purchase increments."""
from decimal import Decimal, ROUND_CEILING
from math import isfinite, ceil
from app.database import get_all_ingredients_db
from app.models.schemas import PlanGenerateResponse
from app.optimization.engine import evaluate_recipe_affordability
from app.optimization.calculator import normalize_unit_and_quantity

FOOD_CATEGORIES = {"grain", "egg", "vegetable", "meat", "fish", "protein", "canned", "legume", "fruit"}


def basket_option(ingredients, prices, excluded):
    return evaluate_recipe_affordability({"recipe_id": "shopping_basket", "name": "Items to buy",
        "base_servings": 1, "ingredients": ingredients}, 1, {}, prices, excluded)


def fill_food_budget(budget, prices, excluded, catalog=None, _refills=3):
    """Diversify first, then minimize remaining cents using purchasable food lots.
    Larger budgets repeat a varied seed basket before a bounded PHP 1,000 search.
    Rounded-up lot costs ensure aggregated quantities never overspend.
    """
    limit = int(Decimal(str(budget)) * 100)
    lots = []
    catalog = get_all_ingredients_db() if catalog is None else catalog
    for item in catalog:
        iid = item["ingredient_id"]
        price = prices.get(iid)
        if iid in excluded or not price or item["category"] not in FOOD_CATEGORIES:
            continue
        unit_price = float(price["normalized_price_per_base_unit"])
        if not isfinite(unit_price) or unit_price <= 0:
            continue
        minimum = float(price.get("minimum_purchase_quantity") or 0)
        increment = float(item["default_purchase_increment"] or 1)
        if minimum > 0:
            increment = ceil(increment / minimum) * minimum
        if item["base_unit"] == "piece":
            increment = ceil(increment)
        cost = int((Decimal(str(increment)) * Decimal(str(unit_price)) * 100).to_integral_value(rounding=ROUND_CEILING))
        if 0 < cost <= limit:
            lots.append((item, increment, cost))
    if not lots:
        return None
    quantities = [0] * len(lots)
    used_categories = set()
    seed_cost = 0
    for index, (item, _, cost) in enumerate(lots):
        if item["category"] not in used_categories and seed_cost + cost <= limit // 2:
            quantities[index] = 1
            seed_cost += cost
            used_categories.add(item["category"])
    if not seed_cost:
        cheapest = min(range(len(lots)), key=lambda i: lots[i][2])
        quantities[cheapest] = 1
        seed_cost = lots[cheapest][2]
    repeats = min(limit // seed_cost, max(1, (limit - 100000 + seed_cost - 1) // seed_cost))
    quantities = [qty * repeats for qty in quantities]
    available = limit - seed_cost * repeats
    scale = max(1, ceil(available / 100000))
    steps = available // scale
    scaled_costs = [ceil(cost / scale) for _, _, cost in lots]
    counts = [steps + 1] * (steps + 1)
    previous = [-1] * (steps + 1)
    counts[0] = 0
    for amount in range(1, steps + 1):
        for index, cost in enumerate(scaled_costs):
            if cost <= amount and counts[amount - cost] + 1 < counts[amount]:
                counts[amount] = counts[amount - cost] + 1
                previous[amount] = index
    target = next(amount for amount in range(steps, -1, -1) if counts[amount] <= steps)
    while target:
        index = previous[target]
        quantities[index] += 1
        target -= scaled_costs[index]
    ingredients = [{"ingredient_id": item["ingredient_id"], "name": item["canonical_name"],
        "quantity": increment * quantities[index], "unit": item["base_unit"]}
        for index, (item, increment, _) in enumerate(lots) if quantities[index]]
    option, _ = basket_option(ingredients, prices, excluded)
    if option and option.estimated_total_php <= budget:
        option.remaining_php = round(budget - option.estimated_total_php, 2)
        # Conservative lot rounding accumulates for large quantities. Fill the actual
        # priced remainder too, then reprice merged quantities to verify the final total.
        if _refills and option.remaining_php > 0:
            extra = fill_food_budget(option.remaining_php, prices, excluded, catalog, _refills - 1)
            if extra:
                merged = {}
                for item in option.items_to_buy + extra.items_to_buy:
                    qty, unit = normalize_unit_and_quantity(item.quantity, item.unit)
                    if item.ingredient_id not in merged:
                        merged[item.ingredient_id] = {"ingredient_id": item.ingredient_id,
                            "name": item.name, "quantity": 0, "unit": unit}
                    merged[item.ingredient_id]["quantity"] += qty
                combined, _ = basket_option(list(merged.values()), prices, excluded)
                if combined and combined.estimated_total_php <= budget:
                    option = combined
                    option.remaining_php = round(budget - option.estimated_total_php, 2)
        option.warnings.append("Uses saved prices and purchase increments. Any remainder cannot be reliably filled with these food lots. Confirm actual prices at the shop.")
        return option
    return None


def shopping_plan(req, prices, excluded):
    if not req.shopping_items:
        option = fill_food_budget(req.budget_php, prices, excluded)
        return PlanGenerateResponse(status="feasible" if option else "no_match",
            budget_php=req.budget_php, shopping_list=True, options=[option] if option else [],
            total_spent_php=option.estimated_total_php if option else 0,
            remaining_total_php=option.remaining_php if option else req.budget_php,
            reason_if_no_match=None if option else "No priced food purchase fits this budget and exclusions.")
    catalog = get_all_ingredients_db()
    selected = {}
    for item in req.shopping_items:
        term = str(item.get("term", "")).strip().lower()
        match = next((food for food in catalog if term in [food["ingredient_id"].lower(),
            food["canonical_name"].lower(), *[alias.lower() for alias in food["aliases"]]]), None)
        qty = item.get("quantity", 1)
        if not match or isinstance(qty, bool) or not isinstance(qty, (int, float)) or not isfinite(qty) or qty <= 0:
            return PlanGenerateResponse(status="invalid_request", budget_php=req.budget_php,
                shopping_list=True, reason_if_no_match="Specify a known food, positive quantity and its purchase unit.")
        iid = match["ingredient_id"]
        unit = item.get("unit") or match["base_unit"]
        if unit == "piece" and qty != int(qty):
            return PlanGenerateResponse(status="invalid_request", budget_php=req.budget_php,
                shopping_list=True, reason_if_no_match="Pieces must be a positive whole number.")
        normalized_qty, base_unit = normalize_unit_and_quantity(qty, unit)
        if iid in excluded or base_unit != match["base_unit"]:
            return PlanGenerateResponse(status="invalid_request", budget_php=req.budget_php,
                shopping_list=True, reason_if_no_match=f"{match['canonical_name']} is excluded or cannot be priced in {unit}. Its recorded unit is {match['base_unit']}.")
        if iid not in selected:
            selected[iid] = {"ingredient_id": iid, "name": match["canonical_name"], "quantity": 0, "unit": base_unit}
        selected[iid]["quantity"] += normalized_qty
    option, error = basket_option(list(selected.values()), prices, excluded)
    if not option or option.estimated_total_php > req.budget_php:
        return PlanGenerateResponse(status="needs_price_data" if not option else "no_match",
            budget_php=req.budget_php, shopping_list=True, reason_if_no_match=error or
            f"Those quantities cost PHP {option.estimated_total_php:.2f}, above your budget. Try fewer items.")
    option.remaining_php = round(req.budget_php - option.estimated_total_php, 2)
    option.warnings.append("Requested quantities are kept, rounded to recorded purchase increments. No extra items were added.")
    return PlanGenerateResponse(status="feasible", budget_php=req.budget_php, shopping_list=True,
        options=[option], total_spent_php=option.estimated_total_php, remaining_total_php=option.remaining_php)
