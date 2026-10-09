from fastapi.testclient import TestClient
from app.main import app
from app.local_ai.parser import rule_assisted_taglish_fallback


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