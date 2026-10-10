"""Cost real breakfast/lunch/dinner purchases with one evolving inventory."""
from decimal import Decimal, ROUND_HALF_UP
from app.models.schemas import PlanGenerateResponse, ScheduledDay, ScheduledMeal
from app.optimization.engine import evaluate_recipe_affordability
from app.optimization.shopping import fill_food_budget
from app.optimization.calculator import normalize_unit_and_quantity

MEALS = ("breakfast", "lunch", "dinner")


def money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def daily_schedule(request, recipes, prices, catalog=()):
    amount = money(request.budget_php)
    total = amount * request.days if request.budget_basis == "per_day" else amount
    cents = int(total * 100)
    allocations = [Decimal(cents // request.days + (i < cents % request.days)) / 100
                   for i in range(request.days)]
    inventory = {item.ingredient_id: (item.quantity, item.unit) for item in request.pantry}
    schedule = []
    total_spent = Decimal("0.00")
    previous_ids = []
    complete = True
    skipped = {(item.day, item.meal_type) for item in request.skipped_meals}
    choices_by_meal = {(item.day, item.meal_type): item.recipe_id for item in request.meal_choices}
    for day_index, allocation in enumerate(allocations):
        # Bounded search reserves money for later meals, rather than spending it all at breakfast.
        states = [(inventory, [], Decimal("0.00"), previous_ids)]
        for meal in MEALS:
            candidates = []
            for stock, choices, spent, used_ids in states:
                candidates.append((stock, choices + [None], spent, used_ids))
                if (day_index + 1, meal) in skipped:
                    continue
                for recipe in recipes:
                    chosen_recipe = choices_by_meal.get((day_index + 1, meal))
                    if chosen_recipe and recipe["recipe_id"] != chosen_recipe:
                        continue
                    if recipe.get("meal_types") and meal not in recipe["meal_types"]:
                        continue
                    if request.max_prep_minutes is not None and recipe.get("prep_minutes", 0) + recipe.get("cook_minutes", 0) > request.max_prep_minutes:
                        continue
                    after = {}
                    option, _ = evaluate_recipe_affordability(recipe, request.servings, stock, prices,
                                                              request.excluded_ingredient_ids, after)
                    if option is None:
                        continue
                    cost = money(option.estimated_total_php)
                    if spent + cost > allocation:
                        continue
                    candidates.append((after, choices + [option], spent + cost, used_ids + [option.recipe_id]))
            # Keep both cheap and fuller baskets so an expensive breakfast cannot crowd out dinner.
            cheapest = sorted(candidates, key=lambda s: (-sum(o is not None for o in s[1]), s[2]))[:16]
            fullest = sorted(candidates, key=lambda s: (-sum(o is not None for o in s[1]), -s[2]))[:16]
            states = cheapest + fullest
        best = min(states, key=lambda s: (-sum(o is not None for o in s[1]), -s[2], len(s[3]) - len(set(s[3]))))
        inventory, choices, day_spent, previous_ids = best
        remaining_day = allocation
        meals = []
        for meal, option in zip(MEALS, choices):
            is_skipped = (day_index + 1, meal) in skipped
            cost = money(option.estimated_total_php) if option else Decimal("0.00")
            remaining_day -= cost
            total_spent += cost
            if option:
                option.remaining_php = float(remaining_day)
            elif not is_skipped:
                complete = False
            meals.append(ScheduledMeal(meal_type=meal, skipped=is_skipped, option=option, cost_php=float(cost),
                remaining_day_php=float(remaining_day), remaining_total_php=float(total - total_spent),
                reason="Skipped as requested. No budget deducted." if is_skipped else None if option else "Could not schedule this meal within the day's remaining budget and restrictions."))
        # Use remaining funds for separately labelled groceries, never inflated meal portions.
        extras = None
        if any(choices) and all(option or (day_index + 1, meal) in skipped for meal, option in zip(MEALS, choices)) and remaining_day > 0:
            extras = fill_food_budget(float(remaining_day), prices, request.excluded_ingredient_ids, catalog)
        if extras:
            cost = money(extras.estimated_total_php)
            day_spent += cost
            total_spent += cost
            remaining_day -= cost
            extras.recipe_name = "Extra groceries within the remaining budget"
            extras.remaining_php = float(remaining_day)
            for item in extras.items_to_buy:
                quantity, unit = normalize_unit_and_quantity(item.quantity, item.unit)
                stock, stock_unit = inventory.get(item.ingredient_id, (0, unit))
                stock, _ = normalize_unit_and_quantity(stock, stock_unit)
                inventory[item.ingredient_id] = (stock + quantity, unit)
        schedule.append(ScheduledDay(day=day_index + 1, allocated_php=float(allocation),
            spent_php=float(day_spent), remaining_php=float(remaining_day), meals=meals, extra_groceries=extras))
    any_meals = any(meal.option for day in schedule for meal in day.meals)
    return PlanGenerateResponse(status="feasible" if complete else "partial" if any_meals else "no_match",
        budget_php=float(total), schedule=schedule, total_spent_php=float(total_spent),
        remaining_total_php=float(total - total_spent),
        reason_if_no_match=None if complete else "This is an incomplete schedule. Some meals could not be planned with the saved prices and restrictions.")
