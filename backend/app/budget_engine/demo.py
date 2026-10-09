"""Offline demo of the Data Science engine (no LLM, no network).

Run from backend/:  python -m app.budget_engine.demo
Walks Journey A (PHP 200, 4 people, rice/garlic/soy sauce at home), a market price change,
and Journey E (impossible budget).
"""
import time

from . import DataStore, generate_plan, reprice_plan


def show(resp):
    print(f"status: {resp['status']}")
    for o in resp.get("options", []):
        print(f"  - {o['recipe_name']}: PHP {o['estimated_total_php']:.2f} "
              f"(PHP {o['remaining_php']:.2f} left, score {o['score']})")
        for i in o["items_to_buy"]:
            print(f"      buy {i['pack_note']:<22} {i['name']:<32} PHP {i['cost_php']:.2f} [{i['price_source_type']}]")
    if resp.get("reason_if_no_match"):
        print("  reason:", resp["reason_if_no_match"])


def main():
    store = DataStore.from_json_dir()
    request = {"budget_php": 200, "servings": 4, "meal_scope": "single_meal", "meal_type": "dinner",
               "pantry": [{"ingredient_id": "kanin"}, {"ingredient_id": "bawang"}, {"ingredient_id": "toyo"}],
               "excluded_ingredient_ids": [], "max_prep_minutes": None}

    print("== Journey A: PHP 200, 4 servings, has rice/garlic/soy sauce ==")
    t = time.perf_counter()
    resp = generate_plan(request, store)
    print(f"(computed in {(time.perf_counter() - t) * 1000:.1f} ms)")
    show(resp)

    print("\n== Budget PHP 250, chooses Pritong Tilapia, then vendor says tilapia is PHP 190/kg ==")
    r2 = dict(request, budget_php=250)
    first = reprice_plan(r2, "pritong-tilapia", store)
    print(f"  before: PHP {first['new_total_php']:.2f}, feasible={first['selected_still_feasible']}")
    store.add_price(store.build_price_record("tilapia", 190, 1, "kg"))
    after = reprice_plan(r2, "pritong-tilapia", store, previous_total_php=first["new_total_php"])
    print(f"  after:  PHP {after['new_total_php']:.2f} (delta {after['delta_php']:+.2f}), "
          f"feasible={after['selected_still_feasible']}")
    for o in after["alternatives"]:
        print(f"  alternative: {o['recipe_name']} PHP {o['estimated_total_php']:.2f}")

    print("\n== Journey E: PHP 40 for 6 people, no pork, no seafood ==")
    show(generate_plan(dict(request, budget_php=40, servings=6, excluded_ingredient_ids=["pork", "seafood"]), store))


if __name__ == "__main__":
    main()
