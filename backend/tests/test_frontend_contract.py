from fastapi.testclient import TestClient
from app.main import app
from app.local_ai.parser import rule_assisted_taglish_fallback


def test_buy_food_followups_and_empty_pantry():
    for text in ["if theres no recipe, what food can i buy for 100 pesos so i can eat",
                 "but i dont have foods in my pantry", "wala akong pagkain sa pantry"]:
        result = rule_assisted_taglish_fallback(text, {"budget_php": 100, "servings": 3})
        assert result.intent == "buy_food"
        assert result.budget_php == 100
        assert result.excluded_ingredients == []
    assert rule_assisted_taglish_fallback("but i dont have foods in my pantry").pantry_empty


def test_basic_food_fits_budget_without_pantry_and_respects_allergies():
    with TestClient(app) as client:
        request = {"budget_php": 100, "servings": 3, "pantry": [], "basic_food": True}
        result = client.post("/api/plans/generate", json=request).json()
        assert result["basic_food"]
        assert result["status"] == "feasible"
        for option in result["options"]:
            assert option["estimated_total_php"] <= 100
            assert not option["pantry_items_used"]
            assert abs(sum(i["cost_php"] for i in option["items_to_buy"]) - option["estimated_total_php"]) < 0.01
        excluded = client.post("/api/plans/generate", json={**request, "excluded_ingredient_ids": ["egg"]}).json()
        assert all(i["ingredient_id"] != "eggs" for o in excluded["options"] for i in o["items_to_buy"])
        unknown = client.post("/api/plans/generate", json={**request, "excluded_ingredient_ids": ["unknown-allergen"]}).json()
        assert unknown["status"] == "invalid_request"
        assert unknown["options"] == []


def test_parser_uses_dashboard_constraints_and_explicit_overrides():
    result = rule_assisted_taglish_fallback("Plan dinner", {"budget_php": 150, "servings": 2})
    assert result.budget_php == 150
    assert result.servings == 2
    assert result.clarification_question is None
    explicit = rule_assisted_taglish_fallback("200 pesos for 3 people", {"budget_php": 150, "servings": 2})
    assert explicit.budget_php == 200
    assert explicit.servings == 3
    word_budget = rule_assisted_taglish_fallback("tatlong daan pesos for 3 people", {"budget_php": 150, "servings": 2})
    assert word_budget.budget_php == 300


def test_frontend_plan_recipe_pantry_and_price_contract():
    with TestClient(app) as client:
        ingredients = client.get("/api/ingredients")
        assert ingredients.status_code == 200
        assert any(item["ingredient_id"] == "eggs" for item in ingredients.json())
        stock = client.post("/api/pantry/upsert", json={"ingredient_id": "eggs", "quantity": 6, "unit": "piece"})
        assert stock.status_code == 200
        assert client.get("/api/pantry").json()[0]["quantity"] == 6
        plan = client.post("/api/plans/generate", json={"budget_php": 500, "servings": 3, "meal_scope": "single_meal", "pantry": []})
        assert plan.status_code == 200
        assert plan.json()["status"] == "feasible"
        option = plan.json()["options"][0]
        recipe = client.get(f'/api/recipes/{option["recipe_id"]}')
        assert recipe.status_code == 200
        assert recipe.json()["steps"]
        item = option["items_to_buy"][0]
        assert item["cost_php"] > 0
        price = client.post("/api/prices/upsert", json={"ingredient_id": item["ingredient_id"], "amount_php": item["cost_php"], "quantity": item["quantity"], "unit": item["unit"], "source_type": "user_entered"})
        assert price.status_code == 200
        assert price.json()["is_user_confirmed"] is True
        repriced = client.post("/api/plans/reprice", json={"recipe_id": option["recipe_id"], "budget_php": 500, "servings": 3, "pantry": []})
        assert repriced.status_code == 200
        assert abs(repriced.json()["estimated_total_php"] - option["estimated_total_php"]) < 0.05
