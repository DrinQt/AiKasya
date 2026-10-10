from fastapi.testclient import TestClient
from app.main import app
from app.local_ai.parser import rule_assisted_taglish_fallback


def test_hypothetical_budget_is_explicit_and_separate_from_home_settings():
    settings = {"budget_php": 200, "servings": 1, "intent": "plan_meal"}
    for message in ["what if my budget is 300", "paano kung budget ko ay 300", "how about 300 pesos"]:
        parsed = rule_assisted_taglish_fallback(message, settings)
        assert parsed.scenario_budget_php == 300
        assert parsed.intent == "plan_meal"
    for message in ["Dinner within 20 minutes", "300 budget", "what if I have no rice"]:
        assert rule_assisted_taglish_fallback(message, settings).scenario_budget_php is None
    assert settings["budget_php"] == 200


def test_free_chat_collects_details_and_accepts_changes_without_home_defaults():
    first = rule_assisted_taglish_fallback("100 budget ko para sa isang araw", {"free_chat": True})
    assert first.budget_php == 100
    assert first.days == 1
    assert first.servings is None
    assert first.missing_required_fields == ["servings"]
    next_turn = rule_assisted_taglish_fallback("ako lang", {
        "free_chat": True, "budget_php": 100, "days": 1})
    assert next_turn.servings == 1
    assert next_turn.clarification_question is None
    changed = rule_assisted_taglish_fallback("what if my budget is 300", {
        "free_chat": True, "budget_php": 100, "servings": 1, "days": 1})
    assert changed.budget_php == 300
    assert changed.servings == 1
    assert changed.days == 1
    assert changed.clarification_question is None
    shopping = rule_assisted_taglish_fallback("Buy 3 pieces of eggs with 100 pesos", {"free_chat": True})
    assert shopping.clarification_question is None
    assert shopping.shopping_items == [{"term": "egg", "quantity": 3}]
    natural = rule_assisted_taglish_fallback("200 pesos for two people for one day", {"free_chat": True})
    assert natural.servings == 2
    assert natural.days == 1
    assert natural.clarification_question is None


def test_buy_food_followups_and_empty_pantry():
    for text in ["if theres no recipe, what food can i buy for 100 pesos so i can eat",
                 "but i dont have foods in my pantry", "wala akong pagkain sa pantry"]:
        result = rule_assisted_taglish_fallback(text, {"budget_php": 100, "servings": 3})
        assert result.intent == "buy_food"
        assert result.budget_php == 100
        assert result.excluded_ingredients == []
    assert rule_assisted_taglish_fallback("but i dont have foods in my pantry").pantry_empty


def test_guided_meal_prompts_keep_settings_and_apply_constraints():
    settings = {"budget_php": 600, "servings": 2, "days": 3}
    dinner = rule_assisted_taglish_fallback("Dinner without fish", settings)
    assert dinner.intent == "plan_meal"
    assert dinner.budget_php == 600
    assert dinner.servings == 2
    assert dinner.meal_type == "dinner"
    assert dinner.excluded_ingredients == ["fish"]
    quick = rule_assisted_taglish_fallback("Dinner within 20 minutes", settings)
    assert quick.max_prep_minutes == 20
    pantry = rule_assisted_taglish_fallback("What can I cook with my pantry ingredients?", settings)
    assert pantry.intent == "plan_meal"


def test_meal_recipe_and_shopping_intents_are_distinct():
    settings = {"budget_php": 100, "servings": 3}
    assert rule_assisted_taglish_fallback("Meal ideas for dinner", settings).intent == "plan_meal"
    assert rule_assisted_taglish_fallback("Show me a dinner recipe", settings).intent == "view_recipe"
    items = rule_assisted_taglish_fallback("Buy 3 pieces of eggs with 100 pesos", settings)
    assert items.intent == "buy_food"
    assert items.shopping_items == [{"term": "egg", "quantity": 3}]
    assert rule_assisted_taglish_fallback("100 budget", {**settings, "intent": "buy_food"}).intent == "buy_food"
    assert rule_assisted_taglish_fallback("Dinner without fish", {**settings, "intent": "view_recipe"}).intent == "view_recipe"


def test_piece_shopping_uses_total_budget_not_servings_and_preserves_quantities():
    with TestClient(app) as client:
        request = {"budget_php": 100, "servings": 8, "shopping_list": True,
                   "shopping_items": [{"term": "egg", "quantity": 3}]}
        result = client.post("/api/plans/generate", json=request).json()
        assert result["shopping_list"]
        assert result["status"] == "feasible"
        option = result["options"][0]
        assert option["items_to_buy"][0]["quantity"] == 3
        assert option["estimated_total_php"] <= 100
        assert option["remaining_php"] == round(100 - option["estimated_total_php"], 2)
        too_many = client.post("/api/plans/generate", json={**request, "shopping_items": [{"term": "egg", "quantity": 100}]}).json()
        assert too_many["status"] == "no_match"
        assert not too_many["options"]
        allergic = client.post("/api/plans/generate", json={**request, "excluded_ingredient_ids": ["egg"]}).json()
        assert not allergic["options"]


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
