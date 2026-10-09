"""Interactive tester for the AIKasya budget engine. Run from backend/:  python try_aikasya.py"""
from app.budget_engine import DataStore, generate_plan

store = DataStore.from_json_dir()


def ask(prompt, default=""):
    try:
        v = input(f"{prompt} [{default}]: ").strip()
    except EOFError:
        raise SystemExit("\nDone.")
    return v or default


def show(plan):
    print(f"\nStatus: {plan['status']}")
    if plan.get("reason_if_no_match"):
        print("Reason:", plan["reason_if_no_match"])
    for w in plan.get("warnings", []):
        print("Note:", w)
    for n, o in enumerate(plan["options"], 1):
        print(f"\n{n}. {o['recipe_name']}  |  total PHP {o['estimated_total_php']:.2f}  |  "
              f"left PHP {o['remaining_php']:.2f}  |  {o['total_minutes']} min")
        for i in o["items_to_buy"]:
            src = "OFFICIAL" if i["price_source_type"] == "official_reference" else (
                "YOU" if i["price_source_type"] == "user_entered" else "ESTIMATE")
            print(f"     buy {i['pack_note']:<20} {i['name']:<34} PHP {i['cost_php']:>7.2f}  "
                  f"[{src}: {i['price_reference']}]")
        for u in o["pantry_items_used"]:
            print(f"     have {u['name']}")
        for w in o["warnings"]:
            print(f"     ! {w}")


print("AIKasya tester (press Enter to accept the value in brackets)\n")
request = {
    "budget_php": float(ask("Budget in pesos", "200")),
    "servings": int(ask("How many people", "4")),
    "meal_scope": "single_meal",
    "meal_type": ask("Meal type (breakfast/lunch/dinner/snack, or blank for any)", "dinner") or None,
    "pantry": [{"ingredient_id": x.strip()} for x in ask("What you already have (comma-separated)", "kanin, bawang, toyo").split(",") if x.strip()],
    "excluded_ingredient_ids": [x.strip() for x in ask("Avoid (e.g. pork, seafood, egg; blank for none)", "").split(",") if x.strip()],
    "max_prep_minutes": None,
}
show(generate_plan(request, store))

while True:
    print("\nMarket Mode: change a price and replan (press Enter to quit)")
    name = ask("Ingredient (e.g. kangkong, tilapia, kamatis)", "")
    if not name:
        break
    try:
        amount = float(ask("New price in pesos", "") or "nan")
        if amount != amount:
            raise ValueError("please type a price, e.g. 25")
        qty = float(ask("For how much", "1"))
        unit = ask("Unit (kg, g, ml, L, piece, bundle)", "kg")
        store.add_price(store.build_price_record(name, amount, qty, unit))
        print(f"Updated {store.resolve_ingredient_id(name)}: PHP {amount:.2f} per {qty:g} {unit}")
        request["budget_php"] = float(ask("Budget (change it to simulate a different day's cash)", str(request["budget_php"])))
        show(generate_plan(request, store))
    except ValueError as e:
        print("Not accepted:", e)
print("Done. (Prices you entered here are not saved.)")
