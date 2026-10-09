"""Allergy / exclusion safety tests (Data Science). Uses the isolated test DB from conftest.py."""
from fastapi.testclient import TestClient
from app.main import app

FISH = {"fish_sauce", "tilapia", "sardines_can"}


def _ids(opt):
    return {i["ingredient_id"] for i in opt["items_to_buy"]} | {p["ingredient_id"] for p in opt["pantry_items_used"]}


def _plan(client, excluded, budget=1000, meal_type="dinner"):
    return client.post("/api/plans/generate", json={
        "budget_php": budget, "servings": 4, "meal_scope": "single_meal", "meal_type": meal_type,
        "pantry": [], "excluded_ingredient_ids": excluded}).json()


def test_resolve_words_in_english_and_tagalog():
    with TestClient(app) as c:
        r = c.post("/api/exclusions/resolve", json={"terms": ["shrimp", "isda", "kryptonite"]}).json()
        assert "bagoong" in r["excluded_ingredient_ids"]                 # shrimp -> shrimp paste
        assert FISH <= set(r["excluded_ingredient_ids"])                 # fish -> patis, tilapia, sardines
        assert r["unknown"] == ["kryptonite"]                            # never silently ignored
        assert r["disclaimer"]
        hipon = c.post("/api/exclusions/resolve", json={"terms": ["hipon"]}).json()
        assert hipon["excluded_ingredient_ids"] == ["bagoong"]
        baboy = c.post("/api/exclusions/resolve", json={"terms": ["baboy"]}).json()
        assert set(baboy["excluded_ingredient_ids"]) == {"pork_kasim", "pork_giniling"}


def test_shrimp_allergy_removes_pinakbet_and_never_serves_bagoong():
    with TestClient(app) as c:
        plan = _plan(c, ["shrimp"])
        assert plan["status"] == "feasible"
        for opt in plan["options"]:
            assert "bagoong" not in _ids(opt)
            assert opt["recipe_id"] != "pinakbet"
        rep = c.post("/api/plans/reprice", json={"recipe_id": "pinakbet", "budget_php": 1000, "servings": 4,
                                                  "pantry": [], "excluded_ingredient_ids": ["shrimp"]})
        assert rep.status_code == 400                                    # pinakbet needs bagoong, no safe swap


def test_fish_allergy_blocks_hidden_fish_sauce_and_substitutes_salt():
    with TestClient(app) as c:
        plan = _plan(c, ["fish"])
        assert plan["status"] == "feasible"
        for opt in plan["options"]:
            assert not (_ids(opt) & FISH)
        rep = c.post("/api/plans/reprice", json={"recipe_id": "sinigang-na-baboy", "budget_php": 1000, "servings": 4,
                                                  "pantry": [], "excluded_ingredient_ids": ["isda"]}).json()
        assert "fish_sauce" not in _ids(rep) and "salt" in _ids(rep)
        assert any("Substituted Fish sauce with Iodized salt" in w for w in rep["warnings"])


def test_unknown_allergy_word_asks_for_clarification():
    with TestClient(app) as c:
        plan = _plan(c, ["kryptonite"])
        assert plan["status"] == "invalid_request" and plan["options"] == []
        assert "kryptonite" in plan["reason_if_no_match"]


def test_label_check_warning_for_packaged_items_when_allergies_set():
    with TestClient(app) as c:
        rep = c.post("/api/plans/reprice", json={"recipe_id": "adobong-kangkong", "budget_php": 1000, "servings": 4,
                                                  "pantry": [], "excluded_ingredient_ids": ["peanut"]}).json()
        assert any("read the label of Soy sauce" in w for w in rep["warnings"])
        none = c.post("/api/plans/reprice", json={"recipe_id": "adobong-kangkong", "budget_php": 1000, "servings": 4,
                                                   "pantry": []}).json()
        assert not any("read the label" in w for w in none["warnings"])  # no allergy -> no noise


def test_ids_still_work_and_old_clients_unaffected():
    with TestClient(app) as c:
        plan = _plan(c, ["chicken"], budget=500)
        assert plan["status"] == "feasible"
        for opt in plan["options"]:
            assert "chicken" not in _ids(opt)
        assert _plan(c, [], budget=200)["status"] == "feasible"


def test_fallback_parser_extracts_allergies_and_exclusions():
    from app.local_ai.parser import rule_assisted_taglish_fallback as parse
    assert parse("allergic ako sa hipon, 300 pesos para sa 4").excluded_ingredients == ["hipon"]
    assert parse("I'm allergic to shrimp and peanuts").excluded_ingredients == ["shrimp", "peanuts"]
    assert parse("may allergy kami sa isda at hipon").excluded_ingredients == ["isda", "hipon"]
    assert parse("walang patis").excluded_ingredients == ["patis"]          # was "p" before the fix
    assert parse("no egg please").excluded_ingredients == ["egg"]
    assert parse("May 200 pesos ako pang-ulam ng apat, may kanin at bawang na kami").excluded_ingredients == []


def test_chat_to_safe_plan_end_to_end():
    with TestClient(app) as c:
        ai = c.post("/api/agent/interpret", json={"message": "allergic ako sa hipon at isda, 300 pesos para sa 4",
                                                  "session_id": "t", "existing_constraints": {}}).json()
        plan = _plan(c, ai["excluded_ingredients"], budget=300)
        assert plan["status"] == "feasible"
        for opt in plan["options"]:
            assert not (_ids(opt) & (FISH | {"bagoong"}))
