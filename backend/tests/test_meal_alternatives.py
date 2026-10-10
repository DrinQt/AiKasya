from fastapi.testclient import TestClient
from app.main import app
from app.routes import plans


def test_alternatives_recalculate_complete_plan_and_keep_skips_and_exclusions(monkeypatch):
    recipes = [{"recipe_id": name, "name": name, "base_servings": 1, "steps": ["Cook safely."],
                "ingredients": [{"ingredient_id": ingredient, "quantity": 1, "unit": "piece"}]}
               for name, ingredient in [("egg_meal", "eggs"), ("tofu_meal", "tofu"), ("other_tofu", "tofu")]]
    monkeypatch.setattr(plans, "get_all_recipes_db", lambda: recipes)
    monkeypatch.setattr(plans, "get_all_ingredients_db", lambda: [])
    monkeypatch.setattr(plans, "get_latest_prices_map", lambda: {
        "eggs": {"normalized_price_per_base_unit": 100}, "tofu": {"normalized_price_per_base_unit": 120}})
    with TestClient(app) as client:
        response = client.post("/api/plans/alternatives", json={"budget_php": 500, "servings": 1,
            "meal_scope": "day", "days": 1, "target_day": 1, "target_meal_type": "lunch",
            "exclude_recipe_id": "tofu_meal", "excluded_ingredient_ids": ["egg"],
            "skipped_meals": [{"day": 1, "meal_type": "breakfast"}]})
        assert response.status_code == 200
        alternatives = response.json()["meal_alternatives"]
        assert len(alternatives) == 1
        alternative = alternatives[0]
        assert alternative["recipe_id"] == "other_tofu"
        plan = alternative["plan"]
        assert plan["status"] == "feasible"
        assert plan["total_spent_php"] == 240
        assert plan["remaining_total_php"] == 260
        assert plan["schedule"][0]["meals"][0]["skipped"]
        assert plan["schedule"][0]["meals"][0]["cost_php"] == 0
        assert plan["schedule"][0]["meals"][1]["option"]["recipe_id"] == "other_tofu"
        assert plan["schedule"][0]["meals"][1]["option"]["steps"] == ["Cook safely."]
        assert all(item["ingredient_id"] != "eggs" for meal in plan["schedule"][0]["meals"]
                   if meal["option"] for item in meal["option"]["items_to_buy"])
        assert client.post("/api/plans/alternatives", json={"budget_php": 100, "servings": 1,
            "target_day": 2, "target_meal_type": "lunch"}).status_code == 422
        response = client.post("/api/plans/alternatives", json={"budget_php": 1, "servings": 1,
            "target_day": 1, "target_meal_type": "lunch", "exclude_recipe_id": "tofu_meal"})
        assert response.json()["meal_alternatives"] == []
