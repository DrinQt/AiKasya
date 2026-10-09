"""Pre-handoff check for the AIKasya Data Science module.
Run from backend/:  python ds_check.py
Simulates how the backend will call the engine and checks the handoff's Section 12 test matrix.
"""
import json
import time

from app.budget_engine import DataStore, evaluate_recipe, generate_plan, reprice_plan

store = DataStore.from_json_dir()
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ->  {detail}" if detail else ""))


# 0. Data loads and is consistent
problems = store.validate()
check("0  Dataset loads with no problems", not problems, f"{len(store.ingredients)} ingredients, "
      f"{len(store.recipes)} recipes" if not problems else problems[:3])

# 1. Simulate the Local AI output -> backend -> engine, through JSON like a real HTTP request
ai_output = {"intent": "plan_meal", "budget_php": 200, "servings": 4, "meal_scope": "single_meal",
             "meal_type": "dinner", "pantry_mentions": ["kanin", "bawang", "toyo"],
             "excluded_ingredients": [], "max_prep_minutes": None}
body = json.loads(json.dumps({
    "budget_php": ai_output["budget_php"], "servings": ai_output["servings"],
    "meal_scope": ai_output["meal_scope"], "meal_type": ai_output["meal_type"],
    "pantry": [{"ingredient_id": m} for m in ai_output["pantry_mentions"]],
    "excluded_ingredient_ids": ai_output["excluded_ingredients"],
    "max_prep_minutes": ai_output["max_prep_minutes"]}))
plan = generate_plan(body, store)
json.dumps(plan)  # must be JSON-serializable for FastAPI
check("1  Journey A (PHP 200, 4 people, Taglish pantry) is feasible", plan["status"] == "feasible",
      ", ".join(f"{o['recipe_name']} PHP {o['estimated_total_php']:.2f}" for o in plan["options"]))

# 2. Only meals within budget
check("2  Every option is within PHP 200", all(o["estimated_total_php"] <= 200 for o in plan["options"]))

# 3. Shopping list sum equals the total (what the frontend shows must match the backend)
top = plan["options"][0]
items_sum = round(sum(i["cost_php"] for i in top["items_to_buy"]), 2)
check("3  Shopping list sum equals plan total", items_sum == top["estimated_total_php"],
      f"items {items_sum} vs total {top['estimated_total_php']}")

# 4. Pantry offsets purchases: rice/garlic/soy sauce are NOT bought
bought = {i["ingredient_id"] for i in top["items_to_buy"]}
check("4  Pantry rice/garlic/soy sauce not bought", not bought & {"rice", "garlic", "soy_sauce"},
      f"pantry used: {[u['ingredient_id'] for u in top['pantry_items_used']]}")

# 5. Price increase changes the total and can make a meal unaffordable
r250 = dict(body, budget_php=250)
before = reprice_plan(r250, "pritong-tilapia", store)
test_store = DataStore.from_json_dir()
test_store.add_price(test_store.build_price_record("tilapia", 190, 1, "kg"))
after = reprice_plan(r250, "pritong-tilapia", test_store, previous_total_php=before["new_total_php"])
check("5  Tilapia PHP 190/kg raises the total and triggers alternatives",
      after["delta_php"] > 0 and not after["selected_still_feasible"] and len(after["alternatives"]) > 0,
      f"PHP {before['new_total_php']:.2f} -> {after['new_total_php']:.2f}, "
      f"{len(after['alternatives'])} alternatives")

# 6. Excluded ingredient never appears
noporks = generate_plan(dict(body, budget_php=1000, excluded_ingredient_ids=["pork"]), store, max_options=20)
leak = [o["recipe_name"] for o in noporks["options"]
        if {i["ingredient_id"] for i in o["items_to_buy"] + o["pantry_items_used"]} & {"pork_kasim", "pork_giniling"}]
check("6  'pork' exclusion: no pork in any option", not leak, f"{len(noporks['options'])} options checked")

# 7. Impossible request -> honest no_match, no invented recipe
nm = generate_plan(dict(body, budget_php=40, servings=6), store)
check("7  PHP 40 for 6 people returns no_match with a reason", nm["status"] == "no_match" and not nm["options"],
      (nm["reason_if_no_match"] or "")[:90] + "...")

# 8. Missing price -> needs_price_data, never PHP 0
s2 = DataStore.from_json_dir()
s2.prices = [p for p in s2.prices if p["ingredient_id"] != "kangkong"]
mp = evaluate_recipe("adobong-kangkong", body, s2)
check("8  Missing kangkong price -> needs_price_data", mp["status"] == "needs_price_data",
      f"missing: {mp['missing_price_ingredient_ids']}")

# 9. Mixed units: 1 kg == 1000 g, 0.2 L == 200 ml
a = evaluate_recipe("adobong-manok", dict(body, budget_php=1000, pantry=[
    {"ingredient_id": "rice", "quantity": 1, "unit": "kg"}, {"ingredient_id": "soy_sauce", "quantity": 0.2, "unit": "L"}]), store)
b = evaluate_recipe("adobong-manok", dict(body, budget_php=1000, pantry=[
    {"ingredient_id": "rice", "quantity": 1000, "unit": "g"}, {"ingredient_id": "soy_sauce", "quantity": 200, "unit": "ml"}]), store)
check("9  kg/g and L/ml give identical totals",
      a["option"]["estimated_total_php"] == b["option"]["estimated_total_php"],
      f"PHP {a['option']['estimated_total_php']:.2f}")

# 10. Invalid input is rejected cleanly (backend should return 422 / show the message)
bad = generate_plan(dict(body, budget_php=-50), store)
check("10 Negative budget -> invalid_request", bad["status"] == "invalid_request", bad.get("reason_if_no_match"))

# 11. Fruit / merienda path
sn = generate_plan(dict(body, meal_type="snack", budget_php=150, pantry=[]), store)
check("11 Merienda PHP 150 for 4 is feasible", sn["status"] == "feasible",
      ", ".join(f"{o['recipe_name']} PHP {o['estimated_total_php']:.2f}" for o in sn["options"]))

# 12. Speed (measured, not assumed)
t = time.perf_counter()
for _ in range(100):
    generate_plan(body, store)
ms = (time.perf_counter() - t) * 10
check("12 generate_plan responds fast", ms < 200, f"{ms:.2f} ms average over 100 runs on this machine")

print(f"\n{sum(results)}/{len(results)} checks passed")
print("\nSample /api/plans/generate response (first option, trimmed):")
print(json.dumps({k: top[k] for k in ("recipe_name", "estimated_total_php", "remaining_php", "warnings")},
                 indent=2))
