from decimal import Decimal
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import init_db, get_latest_prices_map, get_all_ingredients_db, upsert_price_db
from app.optimization.shopping import fill_food_budget
from app.optimization.schedule import daily_schedule
from app.models.schemas import PlanGenerateRequest
from app.local_ai.parser import rule_assisted_taglish_fallback


def test_general_request_is_not_a_named_item_and_resets_old_quantities():
    for constraints in ({"free_chat": True}, {"free_chat": True, "shopping_items": [{"term": "egg", "quantity": 3}]}):
        parsed = rule_assisted_taglish_fallback("i have 400 pesos budget for food, list items i can buy", constraints)
        assert parsed.intent == "buy_food" and parsed.budget_php == 400
        assert parsed.shopping_items == [] and parsed.clarification_question is None
    parsed = rule_assisted_taglish_fallback("buy 0.5 kg chicken with 400 pesos", {"free_chat": True})
    assert parsed.shopping_items == [{"term": "chicken", "quantity": 0.5, "unit": "kg"}]


def test_400_basket_uses_real_prices_units_and_almost_all_budget():
    with TestClient(app) as client:
        result = client.post("/api/plans/generate", json={"budget_php": 400, "shopping_list": True}).json()
        assert result["status"] == "feasible"
        option = result["options"][0]
        assert 399 <= option["estimated_total_php"] <= 400
        assert 0 <= option["remaining_php"] <= 1
        assert any(item["unit"] in ("g", "kg") for item in option["items_to_buy"])
        assert len(option["items_to_buy"]) >= 3
        assert sum(Decimal(str(item["cost_php"])) for item in option["items_to_buy"]) == Decimal(str(option["estimated_total_php"]))
        assert result["total_spent_php"] + result["remaining_total_php"] == 400
        prices = get_latest_prices_map()
        for item in option["items_to_buy"]:
            qty = item["quantity"] * (1000 if item["unit"] == "kg" else 1)
            assert abs(item["cost_php"] - qty * prices[item["ingredient_id"]]["normalized_price_per_base_unit"]) < .011


def test_latest_user_price_controls_quantity_and_excluded_foods_are_never_used():
    init_db()
    catalog = get_all_ingredients_db()
    # With only egg prices available, this basket must use the updated price, not seed values.
    upsert_price_db("eggs", 25, 1, "piece", "test", "user_entered")
    egg_prices = {"eggs": get_latest_prices_map()["eggs"]}
    option = fill_food_budget(400, egg_prices, [], catalog)
    assert option.estimated_total_php == 400 and option.items_to_buy[0].quantity == 16
    assert option.items_to_buy[0].price_source_type == "user_entered"
    assert fill_food_budget(400, egg_prices, ["eggs"], catalog) is None
    assert fill_food_budget(400, {}, [], catalog) is None
    assert fill_food_budget(1, egg_prices, [], catalog) is None
    assert fill_food_budget(403, egg_prices, [], catalog).remaining_php == 3


def test_recorded_weight_units_and_explicit_quantities_are_preserved():
    with TestClient(app) as client:
        result = client.post("/api/plans/generate", json={"budget_php": 400, "shopping_list": True,
            "shopping_items": [{"term": "rice", "quantity": 1, "unit": "kg"}]}).json()
        assert result["status"] == "feasible"
        items = result["options"][0]["items_to_buy"]
        assert len(items) == 1 and items[0]["quantity"] == 1 and items[0]["unit"] == "kg"
        invalid = client.post("/api/plans/generate", json={"budget_php": 400, "shopping_list": True,
            "shopping_items": [{"term": "rice", "quantity": 3, "unit": "piece"}]}).json()
        assert invalid["status"] == "invalid_request"
        daily = client.post("/api/plans/generate", json={"budget_php": 200, "budget_basis": "per_day", "days": 2, "shopping_list": True}).json()
        assert daily["budget_php"] == 400


def test_large_budget_search_stays_bounded_and_never_overspends():
    init_db()
    option = fill_food_budget(10000000, get_latest_prices_map(), [])
    assert 9999999 <= option.estimated_total_php <= 10000000
    assert option.remaining_php >= 0


def test_meal_schedule_separates_extra_purchases_and_carries_stock_without_inflating_servings():
    init_db()
    recipes = [{"recipe_id": "egg", "name": "Egg meal", "base_servings": 1,
                "ingredients": [{"ingredient_id": "eggs", "quantity": 1, "unit": "piece"}]}]
    result = daily_schedule(PlanGenerateRequest(budget_php=400, budget_basis="per_day", days=2, servings=1,
        skipped_meals=[{"day": 2, "meal_type": "breakfast"}]), recipes,
        {"eggs": {"normalized_price_per_base_unit": 25}}, get_all_ingredients_db())
    assert result.total_spent_php == 800 and result.remaining_total_php == 0
    assert result.schedule[0].extra_groceries.estimated_total_php == 325
    assert result.schedule[1].meals[0].skipped and result.schedule[1].meals[0].cost_php == 0
    assert result.schedule[1].meals[1].cost_php == 0  # Previous day's extra stock is available.
    assert all(meal.option.servings == 1 for day in result.schedule for meal in day.meals if meal.option)


@pytest.mark.asyncio
async def test_ollama_cannot_invent_a_named_item_for_a_general_list(monkeypatch):
    import app.local_ai.client as ai
    init_db()
    captured = {}
    class Response:
        status_code = 200
        def json(self):
            return {"response": json.dumps({"intent": "buy_food", "budget_php": 400,
                "shopping_items": [{"term": "rice", "quantity": 1}], "excluded_ingredients": []})}
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, json):
            captured.update(json)
            return Response()
    monkeypatch.setattr(ai.httpx, "AsyncClient", lambda **kwargs: Client())
    result = await ai.interpret_user_request("i have 400 pesos budget for food, list items i can buy", {"free_chat": True})
    assert result.shopping_items == [] and result.budget_php == 400
    assert "Current saved food-price catalog" in captured["prompt"] and "price_per_unit" in captured["prompt"]
