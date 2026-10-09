import pytest
from app.database import init_db, get_latest_prices_map, get_all_recipes_db, upsert_price_db
from app.local_ai.parser import rule_assisted_taglish_fallback
from app.optimization.engine import plan_budget_to_meals
from app.models.schemas import PlanGenerateRequest, PantryInputItem
from app.optimization.calculator import normalize_unit_and_quantity, calculate_ingredient_shortfall


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def test_unit_normalization_and_shortfall():
    qty_g, unit = normalize_unit_and_quantity(1.5, "kg")
    assert qty_g == 1500.0
    assert unit == "g"

    to_buy, pantry_used, base_u = calculate_ingredient_shortfall(
        required_qty=1.0,
        required_unit="kg",
        pantry_available_qty=500.0,
        pantry_unit="g",
        purchase_increment=250.0,
    )
    assert pantry_used == 500.0
    assert to_buy == 500.0
    assert base_u == "g"


def test_taglish_nl_parser():
    query = "May 200 pesos ako pang-ulam ng apat, may kanin at bawang na kami"
    parsed = rule_assisted_taglish_fallback(query)

    assert parsed.intent == "plan_meal"
    assert parsed.budget_php == 200.0
    assert parsed.servings == 4
    assert parsed.meal_scope == "single_meal"
    assert "rice" in parsed.pantry_mentions
    assert "garlic" in parsed.pantry_mentions


def test_budget_to_meal_optimizer_primary_demo():
    all_recipes = get_all_recipes_db()
    prices_map = get_latest_prices_map()

    request = PlanGenerateRequest(
        budget_php=200.0,
        servings=4,
        meal_scope="single_meal",
        meal_type="dinner",
        pantry=[
            PantryInputItem(ingredient_id="rice", quantity=1000.0, unit="g"),
            PantryInputItem(ingredient_id="garlic", quantity=100.0, unit="g"),
        ],
        excluded_ingredient_ids=[],
    )

    result = plan_budget_to_meals(request, all_recipes, prices_map)

    assert result.status == "feasible"
    assert len(result.options) > 0

    for opt in result.options:
        assert opt.estimated_total_php <= 200.0
        assert opt.remaining_php >= 0.0
        calculated_sum = sum(item.cost_php for item in opt.items_to_buy)
        assert abs(calculated_sum - opt.estimated_total_php) < 0.05


def test_exclusion_invariant():
    all_recipes = get_all_recipes_db()
    prices_map = get_latest_prices_map()

    request = PlanGenerateRequest(
        budget_php=500.0,
        servings=4,
        pantry=[],
        excluded_ingredient_ids=["chicken"],
    )

    result = plan_budget_to_meals(request, all_recipes, prices_map)
    assert result.status == "feasible"
    for opt in result.options:
        for item in opt.items_to_buy:
            assert item.ingredient_id != "chicken"


def test_impossible_budget_returns_transparent_no_match():
    all_recipes = get_all_recipes_db()
    prices_map = get_latest_prices_map()

    request = PlanGenerateRequest(
        budget_php=20.0,
        servings=4,
        pantry=[],
        excluded_ingredient_ids=[],
    )

    result = plan_budget_to_meals(request, all_recipes, prices_map)
    assert result.status == "no_match"
    assert result.reason_if_no_match is not None
    assert "₱20.00" in result.reason_if_no_match


def test_market_price_recalculation():
    all_recipes = get_all_recipes_db()

    upsert_price_db(
        ingredient_id="tilapia",
        amount_php=240.0,
        quantity=1.0,
        unit="kg",
        market_or_area="SM Makati Market",
        source_type="user_entered",
    )

    updated_prices = get_latest_prices_map()
    assert updated_prices["tilapia"]["amount_php"] == 240.0
