from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.models.schemas import PlanGenerateRequest, PantryInputItem
from app.optimization.schedule import daily_schedule
from app.local_ai.parser import rule_assisted_taglish_fallback
import pytest
from pydantic import ValidationError


def recipe(name, meal, ingredient, quantity=1):
    return {"recipe_id": name, "name": name, "base_servings": 1,
            "meal_types": [meal] if meal else [], "ingredients": [
                {"ingredient_id": ingredient, "quantity": quantity, "unit": "piece"}]}


def test_500_day_tracks_100_breakfast_then_lunch_and_dinner():
    recipes = [recipe("Egg breakfast", "breakfast", "egg"),
               recipe("Lunch", "lunch", "lunch"), recipe("Dinner", "dinner", "dinner")]
    prices = {key: {"normalized_price_per_base_unit": price} for key, price in
              [("egg", 100), ("lunch", 150), ("dinner", 200)]}
    result = daily_schedule(PlanGenerateRequest(budget_php=500, servings=1, meal_scope="day"), recipes, prices)
    assert result.status == "feasible"
    assert [m.remaining_day_php for m in result.schedule[0].meals] == [400, 250, 50]
    assert result.total_spent_php == 450
    assert result.remaining_total_php == 50


def test_pantry_consumed_once_and_bulk_purchase_leftovers_reused():
    recipes = [recipe("Simple meal", None, "egg")]
    request = PlanGenerateRequest(budget_php=100, servings=1, meal_scope="day",
        pantry=[PantryInputItem(ingredient_id="egg", quantity=1, unit="piece")])
    result = daily_schedule(request, recipes, {"egg": {"normalized_price_per_base_unit": 10, "minimum_purchase_quantity": 5}})
    assert [meal.cost_php for meal in result.schedule[0].meals] == [0, 50, 0]
    assert result.total_spent_php == 50
    assert result.status == "feasible"


def test_total_budget_cent_allocations_and_daily_budget_are_distinct():
    total = daily_schedule(PlanGenerateRequest(budget_php=500, servings=1, days=3), [], {})
    assert [day.allocated_php for day in total.schedule] == [166.67, 166.67, 166.66]
    assert sum(Decimal(str(day.allocated_php)) for day in total.schedule) == Decimal("500.00")
    daily = daily_schedule(PlanGenerateRequest(budget_php=500, servings=1, days=2, budget_basis="per_day"), [], {})
    assert daily.budget_php == 1000
    assert [day.allocated_php for day in daily.schedule] == [500, 500]
    assert rule_assisted_taglish_fallback("500 per day for 2 days", {"free_chat": True}).budget_basis == "per_day"
    assert rule_assisted_taglish_fallback("500 per day for 2 days", {"free_chat": True}).budget_php == 500


def test_incomplete_schedule_never_overspends_or_invents_missing_meals():
    result = daily_schedule(PlanGenerateRequest(budget_php=150, servings=1),
        [recipe("Breakfast", "breakfast", "egg"), recipe("Lunch", "lunch", "egg"), recipe("Dinner", "dinner", "egg")],
        {"egg": {"normalized_price_per_base_unit": 100}})
    assert result.status == "partial"
    assert len(result.schedule[0].meals) == 3
    assert sum(meal.option is not None for meal in result.schedule[0].meals) == 1
    assert result.total_spent_php == 100
    assert all(meal.remaining_day_php >= 0 for meal in result.schedule[0].meals)


def test_schedule_endpoint_balances_all_days_and_enforces_allergies():
    with TestClient(app) as client:
        result = client.post("/api/plans/generate", json={"budget_php": 1000, "servings": 1,
            "days": 2, "meal_scope": "day", "excluded_ingredient_ids": ["egg"]}).json()
        assert len(result["schedule"]) == 2
        spent = Decimal("0")
        for day in result["schedule"]:
            day_remaining = Decimal(str(day["allocated_php"]))
            assert [meal["meal_type"] for meal in day["meals"]] == ["breakfast", "lunch", "dinner"]
            for meal in day["meals"]:
                cost = Decimal(str(meal["cost_php"]))
                spent += cost
                day_remaining -= cost
                assert day_remaining == Decimal(str(meal["remaining_day_php"]))
                assert Decimal("1000") - spent == Decimal(str(meal["remaining_total_php"]))
                if meal["option"]:
                    assert all(item["ingredient_id"] != "eggs" for item in meal["option"]["items_to_buy"])
            if day["extra_groceries"]:
                extra = day["extra_groceries"]
                cost = Decimal(str(extra["estimated_total_php"]))
                spent += cost
                day_remaining -= cost
                assert all(item["ingredient_id"] != "eggs" for item in extra["items_to_buy"])
                assert day_remaining == Decimal(str(extra["remaining_php"]))
            assert day_remaining == Decimal(str(day["remaining_php"]))
        assert spent == Decimal(str(result["total_spent_php"]))
        assert spent <= 1000


def test_skipping_breakfast_keeps_running_balances_and_only_affects_requested_day():
    recipes = [recipe("Breakfast", "breakfast", "egg"), recipe("Lunch", "lunch", "lunch"),
               recipe("Dinner", "dinner", "dinner")]
    prices = {key: {"normalized_price_per_base_unit": cost} for key, cost in
              [("egg", 100), ("lunch", 150), ("dinner", 200)]}
    result = daily_schedule(PlanGenerateRequest(budget_php=500, budget_basis="per_day", days=2,
        servings=1, skipped_meals=[{"day": 2, "meal_type": "breakfast"}]), recipes, prices)
    assert result.status == "feasible"
    assert [m.remaining_day_php for m in result.schedule[0].meals] == [400, 250, 50]
    assert [m.remaining_day_php for m in result.schedule[1].meals] == [500, 350, 150]
    skipped = result.schedule[1].meals[0]
    assert skipped.skipped and skipped.option is None and skipped.cost_php == 0
    assert skipped.remaining_total_php == result.schedule[0].meals[-1].remaining_total_php
    assert result.total_spent_php == 800 and result.remaining_total_php == 200


def test_skips_do_not_consume_pantry_and_all_skipped_is_complete():
    request = PlanGenerateRequest(budget_php=500, servings=1,
        pantry=[PantryInputItem(ingredient_id="egg", quantity=1, unit="piece")],
        skipped_meals=[{"day": 1, "meal_type": "breakfast"}])
    result = daily_schedule(request, [recipe("Egg", None, "egg")],
        {"egg": {"normalized_price_per_base_unit": 100}})
    assert [m.cost_php for m in result.schedule[0].meals] == [0, 0, 100]
    request.skipped_meals = [type(request.skipped_meals[0])(day=1, meal_type=m)
                             for m in ("breakfast", "lunch", "dinner")]
    all_skipped = daily_schedule(request, [], {})
    assert all_skipped.status == "feasible"
    assert all_skipped.total_spent_php == 0 and all_skipped.remaining_total_php == 500
    assert all(m.skipped and m.remaining_day_php == 500 for m in all_skipped.schedule[0].meals)


@pytest.mark.parametrize("message, expected", [
    ("Skip breakfast on Day 2", [{"day": 2, "meal_type": "breakfast"}]),
    ("Day 2 no lunch", [{"day": 2, "meal_type": "lunch"}]),
    ("I don't want dinner on day 3", [{"day": 3, "meal_type": "dinner"}]),
    ("walang almusal sa araw 2", [{"day": 2, "meal_type": "breakfast"}]),
    ("skip breakfast and lunch on day 2", [{"day": 2, "meal_type": "breakfast"}, {"day": 2, "meal_type": "lunch"}]),
    ("skip breakfast day 2 and dinner day 3", [{"day": 2, "meal_type": "breakfast"}, {"day": 3, "meal_type": "dinner"}]),
])
def test_parse_meal_skips_without_changing_plan_duration(message, expected):
    parsed = rule_assisted_taglish_fallback(message, {"free_chat": True,
        "budget_php": 500, "servings": 1, "days": 3})
    assert [item.model_dump() for item in parsed.skipped_meals] == expected
    assert parsed.days == 3 and parsed.budget_php == 500 and parsed.servings == 1
    assert parsed.intent == "plan_meal" and parsed.clarification_question is None
    assert parsed.excluded_ingredients == []


def test_skips_persist_restore_and_invalid_days_ask_for_clarification():
    constraints = {"free_chat": True, "budget_php": 500, "servings": 1, "days": 2,
                   "skipped_meals": [{"day": 2, "meal_type": "breakfast"}]}
    assert len(rule_assisted_taglish_fallback("avoid fish", constraints).skipped_meals) == 1
    for text in ("include breakfast on day 2", "don't skip breakfast day 2"):
        assert rule_assisted_taglish_fallback(text, constraints).skipped_meals == []
    assert rule_assisted_taglish_fallback("no eggs for breakfast day 2", constraints).skipped_meals[0].day == 2
    assert rule_assisted_taglish_fallback("skip dinner day 3", constraints).clarification_question
    with pytest.raises(ValidationError):
        PlanGenerateRequest(budget_php=500, days=2, skipped_meals=[{"day": 3, "meal_type": "lunch"}])
