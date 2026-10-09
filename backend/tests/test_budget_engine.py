"""AIKasya Data Science tests: covers the Section 12 minimum test matrix.

Run from backend/:   python -m unittest discover -s tests -v
(stdlib only; pytest also works: python -m pytest tests)
"""
import copy
import json
import sys
import time
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.budget_engine import (  # noqa: E402
    DataStore, UnitError, evaluate_recipe, generate_plan, import_csv_file, import_price_rows,
    option_to_plan_record,
    pantry_after_cooking, reprice_plan,
)

BASE = DataStore.from_json_dir()
PORK_IDS = {"pork_kasim", "pork_giniling"}


def fresh_store():
    return DataStore.from_records(list(BASE.ingredients.values()), copy.deepcopy(BASE.prices),
                                  copy.deepcopy(list(BASE.recipes.values())))


def req(**kw):
    r = {"budget_php": 200, "servings": 4, "meal_scope": "single_meal", "meal_type": "dinner",
         "pantry": [], "excluded_ingredient_ids": [], "max_prep_minutes": None}
    r.update(kw)
    return r


def all_ids(option):
    return {i["ingredient_id"] for i in option["items_to_buy"]} | {i["ingredient_id"] for i in option["pantry_items_used"]}


class TestDataset(unittest.TestCase):
    def test_dataset_is_consistent(self):
        self.assertEqual(BASE.validate(), [])

    def test_dataset_size_and_provenance(self):
        self.assertGreaterEqual(len(BASE.recipes), 12)
        self.assertGreaterEqual(len(BASE.ingredients), 30)
        for p in BASE.prices:
            self.assertIn(p["source_type"], ("official_reference", "user_entered", "demo_seed"))
            self.assertTrue(p["observed_at"])
            self.assertTrue(p["source_reference"])
        for r in BASE.recipes.values():
            self.assertTrue(r["rights_status"])
            self.assertTrue(r["steps"])

    def test_every_price_is_sourced_or_labeled_ai_estimate(self):
        for p in BASE.prices:
            if p["source_type"] == "official_reference":
                self.assertIn("https://", p["source_reference"])
                if not p.get("imported_via"):
                    self.assertIn(p["observed_at"], ("2025-03-01", "2025-02-01"))  # seed rows
            else:
                self.assertEqual(p["source_type"], "demo_seed")
                self.assertIn("AI-generated estimate", p["source_reference"])
        seed = [p for p in BASE.prices if not p.get("imported_via")]
        self.assertEqual(len({p["ingredient_id"] for p in seed}), len(seed))  # one seed row each
        self.assertEqual({p["ingredient_id"] for p in seed}, set(BASE.ingredients))

    def test_alias_resolution(self):
        self.assertEqual(BASE.resolve_ingredient_id("kanin"), "rice")
        self.assertEqual(BASE.resolve_ingredient_id("Bawang"), "garlic")
        self.assertEqual(BASE.resolve_ingredient_id("soy sauce"), "soy_sauce")
        self.assertIsNone(BASE.resolve_ingredient_id("unicorn meat"))


class TestBudgetFeasibility(unittest.TestCase):
    def test_200_for_4_only_returns_affordable_meals(self):
        r = generate_plan(req(), BASE)
        self.assertEqual(r["status"], "feasible")
        self.assertTrue(1 <= len(r["options"]) <= 3)
        for o in r["options"]:
            self.assertLessEqual(o["estimated_total_php"], 200)
            self.assertAlmostEqual(o["remaining_php"], 200 - o["estimated_total_php"], places=2)

    def test_displayed_sum_equals_total(self):
        r = generate_plan(req(budget_php=500), BASE, max_options=20)
        for o in r["options"]:
            s = sum(Decimal(str(i["cost_php"])) for i in o["items_to_buy"])
            self.assertEqual(s + Decimal(str(o["already_spent_php"])), Decimal(str(o["estimated_total_php"])))

    def test_contract_keys_present(self):
        r = generate_plan(req(), BASE)
        for k in ("status", "budget_php", "options", "reason_if_no_match"):
            self.assertIn(k, r)
        o = r["options"][0]
        for k in ("recipe_id", "recipe_name", "servings", "estimated_total_php", "remaining_php",
                  "items_to_buy", "pantry_items_used", "warnings"):
            self.assertIn(k, o)
        for k in ("ingredient_id", "name", "quantity", "unit", "cost_php", "price_source_type", "price_observed_at"):
            self.assertIn(k, o["items_to_buy"][0])
        json.dumps(r)  # JSON-serializable

    def test_demo_seed_warning_shown(self):
        o = generate_plan(req(), BASE)["options"][0]
        self.assertTrue(any("DEMO" in w for w in o["warnings"]))

    def test_deterministic(self):
        self.assertEqual(generate_plan(req(), BASE), generate_plan(req(), BASE))

    def test_meal_type_filter(self):
        r = generate_plan(req(meal_type="breakfast", budget_php=1000), BASE, max_options=20)
        for o in r["options"]:
            self.assertIn("breakfast", BASE.recipes[o["recipe_id"]]["meal_types"])

    def test_time_filter(self):
        r = generate_plan(req(max_prep_minutes=25, budget_php=1000), BASE, max_options=20)
        for o in r["options"]:
            self.assertLessEqual(o["total_minutes"], 25)

    def test_servings_scale_quantities(self):
        o4 = evaluate_recipe("adobong-kangkong", req(budget_php=1000, servings=4), BASE)["option"]
        o8 = evaluate_recipe("adobong-kangkong", req(budget_php=1000, servings=8), BASE)["option"]
        k4 = next(i for i in o4["items_to_buy"] if i["ingredient_id"] == "kangkong")
        k8 = next(i for i in o8["items_to_buy"] if i["ingredient_id"] == "kangkong")
        self.assertEqual(k8["quantity"], 2 * k4["quantity"])


class TestFruitAndMerienda(unittest.TestCase):
    def test_snack_plan_returns_fruit_recipes_within_budget(self):
        r = generate_plan(req(meal_type="snack", budget_php=200), BASE, max_options=10)
        self.assertEqual(r["status"], "feasible")
        ids = {o["recipe_id"] for o in r["options"]}
        self.assertTrue(ids <= {"banana-cue", "ginataang-saba", "prutas-mangga-saging"})
        for o in r["options"]:
            self.assertLessEqual(o["estimated_total_php"], 200)

    def test_fruit_prices_are_official(self):
        for iid in ("saba", "lakatan", "mango"):
            self.assertEqual(BASE.active_price(iid)["source_type"], "official_reference")

    def test_banana_cue_fully_officially_priced(self):
        o = evaluate_recipe("banana-cue", req(meal_type="snack", budget_php=500), BASE)["option"]
        self.assertFalse(any("DEMO" in w for w in o["warnings"]))

    def test_no_rice_side_on_merienda(self):
        o = evaluate_recipe("prutas-mangga-saging", req(meal_type="snack", budget_php=500), BASE)["option"]
        self.assertNotIn("rice", all_ids(o))

    def test_aliases(self):
        self.assertEqual(BASE.resolve_ingredient_id("mangga"), "mango")
        self.assertEqual(BASE.resolve_ingredient_id("saging na saba"), "saba")


class TestRepricing(unittest.TestCase):
    def test_price_increase_changes_total_and_feasibility(self):
        s = fresh_store()
        pantry = [{"ingredient_id": "rice", "quantity": 1, "unit": "kg"}]
        base_total = evaluate_recipe("pritong-tilapia", req(budget_php=10000, pantry=pantry), s)["option"]["estimated_total_php"]
        budget = base_total + 5                         # just fits at current prices
        r = req(budget_php=budget, pantry=pantry)
        before = evaluate_recipe("pritong-tilapia", r, s)
        self.assertEqual(before["status"], "feasible")
        old = s.active_price("tilapia")["amount_php"]
        s.add_price(s.build_price_record("tilapia", round(old * 1.2, 2), 1, "kg", observed_at="2099-01-01"))
        after = reprice_plan(r, "pritong-tilapia", s, previous_total_php=before["option"]["estimated_total_php"])
        self.assertGreater(after["new_total_php"], before["option"]["estimated_total_php"])
        self.assertGreater(after["delta_php"], 0)
        self.assertFalse(after["selected_still_feasible"])
        self.assertTrue(after["alternatives"])
        for o in after["alternatives"]:
            self.assertNotEqual(o["recipe_id"], "pritong-tilapia")
            self.assertLessEqual(o["estimated_total_php"], budget)
        tilapia = next(i for i in after["selected_option"]["items_to_buy"] if i["ingredient_id"] == "tilapia")
        self.assertEqual(tilapia["price_source_type"], "user_entered")

    def test_price_decrease_can_make_recipe_feasible(self):
        s = fresh_store()
        r = req(pantry=[{"ingredient_id": "rice", "quantity": 1000, "unit": "g"}])
        self.assertNotEqual(evaluate_recipe("pritong-tilapia", r, s)["status"], "feasible")
        s.add_price(s.build_price_record("tilapia", 120, 1, "kg", observed_at="2026-10-10T08:00:00"))
        self.assertEqual(evaluate_recipe("pritong-tilapia", r, s)["status"], "feasible")

    def test_unconfirmed_user_price_is_ignored(self):
        s = fresh_store()
        base_total = evaluate_recipe("pritong-tilapia", req(budget_php=500), s)["option"]["estimated_total_php"]
        s.add_price(s.build_price_record("tilapia", 999, 1, "kg", is_user_confirmed=False, observed_at="2026-10-10"))
        self.assertEqual(evaluate_recipe("pritong-tilapia", req(budget_php=500), s)["option"]["estimated_total_php"],
                         base_total)

    def test_already_purchased_money_is_counted(self):
        r = req(budget_php=300, already_purchased=[{"ingredient_id": "kangkong", "quantity": 2, "unit": "bundle",
                                                    "cost_php": 50}])
        o = evaluate_recipe("adobong-kangkong", r, BASE)["option"]
        self.assertEqual(o["already_spent_php"], 50)
        self.assertNotIn("kangkong", {i["ingredient_id"] for i in o["items_to_buy"]})
        self.assertEqual(o["estimated_total_php"], 50 + o["new_purchases_php"])


class TestPantry(unittest.TestCase):
    def test_pantry_rice_and_garlic_offset_purchases(self):
        plain = evaluate_recipe("ginisang-monggo", req(), BASE)["option"]
        with_p = evaluate_recipe("ginisang-monggo", req(pantry=[
            {"ingredient_id": "rice", "quantity": 1000, "unit": "g"},
            {"ingredient_id": "garlic", "quantity": 100, "unit": "g"}]), BASE)["option"]
        bought = {i["ingredient_id"]: i["cost_php"] for i in plain["items_to_buy"]}
        self.assertNotIn("rice", {i["ingredient_id"] for i in with_p["items_to_buy"]})
        self.assertNotIn("garlic", {i["ingredient_id"] for i in with_p["items_to_buy"]})
        self.assertAlmostEqual(plain["estimated_total_php"] - with_p["estimated_total_php"],
                               bought["rice"] + bought["garlic"], places=2)
        self.assertEqual({u["ingredient_id"] for u in with_p["pantry_items_used"]}, {"rice", "garlic"})

    def test_partial_pantry_buys_only_shortfall_rounded_to_increment(self):
        o = evaluate_recipe("ginisang-monggo", req(pantry=[{"ingredient_id": "rice", "quantity": 150, "unit": "g"}]),
                            BASE)["option"]
        rice = next(i for i in o["items_to_buy"] if i["ingredient_id"] == "rice")
        self.assertEqual(rice["required_quantity"], 250)   # 400 needed - 150 on hand
        self.assertEqual(rice["quantity"], 250)            # sold in 250 g steps
        price = BASE.active_price("rice")                   # whatever the current official price is
        per_g = Decimal(str(price["amount_php"])) / (Decimal(str(price["quantity"])) * 1000)
        self.assertEqual(Decimal(str(rice["cost_php"])), (250 * per_g).quantize(Decimal("0.01"), "ROUND_HALF_UP"))

    def test_pantry_without_quantity_is_assumed_with_warning(self):
        o = evaluate_recipe("ginisang-monggo", req(pantry=[{"ingredient_id": "kanin"}]), BASE)["option"]
        self.assertNotIn("rice", {i["ingredient_id"] for i in o["items_to_buy"]})
        self.assertTrue(any("verify" in w for w in o["warnings"]))

    def test_unknown_pantry_item_is_ignored_with_warning(self):
        r = generate_plan(req(pantry=[{"ingredient_id": "dragonfruit", "quantity": 1, "unit": "piece"}]), BASE)
        self.assertEqual(r["status"], "feasible")
        self.assertTrue(any("dragonfruit" in w for w in r["warnings"]))

    def test_pantry_after_cooking_only_reduces_known_quantities(self):
        pantry = [{"ingredient_id": "rice", "quantity": 1000, "unit": "g"},
                  {"ingredient_id": "garlic", "quantity": None, "unit": "g"}]
        r = req(pantry=[pantry[0], {"ingredient_id": "garlic"}])
        o = evaluate_recipe("ginisang-monggo", r, BASE)["option"]
        new = pantry_after_cooking(pantry, o)
        self.assertEqual(new[0]["quantity"], 600)
        self.assertIsNone(new[1]["quantity"])
        self.assertEqual(pantry[0]["quantity"], 1000)  # input not mutated


class TestExclusions(unittest.TestCase):
    def test_excluded_ingredient_never_appears(self):
        r = generate_plan(req(budget_php=1000, excluded_ingredient_ids=["pork"]), BASE, max_options=20)
        self.assertTrue(r["options"])
        for o in r["options"]:
            self.assertFalse(all_ids(o) & PORK_IDS)

    def test_curated_substitution_applied(self):
        o = evaluate_recipe("ginisang-sayote", req(budget_php=1000, excluded_ingredient_ids=["pork"]), BASE)
        self.assertEqual(o["status"], "feasible")
        self.assertIn("tokwa", all_ids(o["option"]))
        self.assertTrue(o["option"]["substitutions_applied"])

    def test_required_excluded_without_substitute_removes_recipe(self):
        r = generate_plan(req(budget_php=1000, excluded_ingredient_ids=["shellfish"]), BASE, max_options=20)
        self.assertNotIn("pinakbet", [o["recipe_id"] for o in r["options"]])

    def test_seafood_exclusion_covers_fish_sauce(self):
        r = generate_plan(req(budget_php=1000, excluded_ingredient_ids=["seafood"]), BASE, max_options=20)
        for o in r["options"]:
            self.assertFalse(all_ids(o) & {"fish_sauce", "tilapia", "sardines_can", "bagoong"})

    def test_unknown_exclusion_warns(self):
        r = generate_plan(req(excluded_ingredient_ids=["kryptonite"]), BASE)
        self.assertTrue(any("kryptonite" in w for w in r["warnings"]))


class TestNoMatchAndMissingData(unittest.TestCase):
    def test_impossible_budget_returns_no_match_not_invented(self):
        r = generate_plan(req(budget_php=20), BASE)
        self.assertEqual(r["status"], "no_match")
        self.assertEqual(r["options"], [])
        self.assertIn("No recipe in our current local library", r["reason_if_no_match"])
        self.assertTrue(any(s["type"] == "increase_budget" for s in r["suggested_changes"]))

    def test_reduce_servings_suggestion(self):
        r = generate_plan(req(budget_php=100, servings=4, pantry=[{"ingredient_id": "rice"}]), BASE)
        self.assertEqual(r["status"], "no_match")
        sugg = {s["type"]: s for s in r["suggested_changes"]}
        self.assertIn("increase_budget", sugg)
        self.assertIn("reduce_servings", sugg)
        # the suggestion must actually be feasible when the user accepts it
        r2 = generate_plan(req(budget_php=100, servings=sugg["reduce_servings"]["servings"],
                               pantry=[{"ingredient_id": "rice"}]), BASE)
        self.assertEqual(r2["status"], "feasible")

    def test_no_candidates_message(self):
        r = generate_plan(req(meal_type="breakfast", max_prep_minutes=5, budget_php=1000), BASE)
        self.assertEqual(r["status"], "no_match")
        self.assertIn("meal type", r["reason_if_no_match"])

    def test_missing_price_is_needs_price_data_not_zero(self):
        s = fresh_store()
        s.prices = [p for p in s.prices if p["ingredient_id"] != "kangkong"]
        e = evaluate_recipe("adobong-kangkong", req(budget_php=1000), s)
        self.assertEqual(e["status"], "needs_price_data")
        self.assertIsNone(e["option"])
        self.assertEqual(e["missing_price_ingredient_ids"], ["kangkong"])
        only = DataStore.from_records(list(s.ingredients.values()), s.prices, [s.recipes["adobong-kangkong"]])
        r = generate_plan(req(budget_php=1000), only)
        self.assertEqual(r["status"], "needs_price_data")
        self.assertIn("kangkong", r["missing_price_ingredient_ids"])


class TestUnitsAndValidation(unittest.TestCase):
    def test_kg_g_and_l_ml_equivalence(self):
        a = evaluate_recipe("adobong-manok", req(budget_php=1000, pantry=[
            {"ingredient_id": "rice", "quantity": 1, "unit": "kg"},
            {"ingredient_id": "soy_sauce", "quantity": 0.2, "unit": "L"}]), BASE)["option"]
        b = evaluate_recipe("adobong-manok", req(budget_php=1000, pantry=[
            {"ingredient_id": "rice", "quantity": 1000, "unit": "g"},
            {"ingredient_id": "soy_sauce", "quantity": 200, "unit": "ml"}]), BASE)["option"]
        self.assertEqual(a["estimated_total_php"], b["estimated_total_php"])

    def test_minimum_purchase_pack(self):
        o = evaluate_recipe("adobong-kangkong", req(), BASE)["option"]
        pepper = next(i for i in o["items_to_buy"] if i["ingredient_id"] == "black_pepper")
        self.assertEqual(pepper["required_quantity"], 2)
        self.assertEqual(pepper["quantity"], 10)
        self.assertEqual(pepper["cost_php"], 8.0)

    def test_incompatible_unit_rejected(self):
        r = generate_plan(req(pantry=[{"ingredient_id": "rice", "quantity": 2, "unit": "ml"}]), BASE)
        self.assertEqual(r["status"], "invalid_request")
        with self.assertRaises(UnitError):
            BASE.build_price_record("tilapia", 190, 1, "L")

    def test_bad_price_rejected(self):
        with self.assertRaises(ValueError):
            BASE.build_price_record("tilapia", -5, 1, "kg")
        with self.assertRaises(ValueError):
            BASE.build_price_record("unicorn", 5, 1, "kg")

    def test_invalid_requests(self):
        self.assertEqual(generate_plan(req(budget_php=0), BASE)["status"], "invalid_request")
        self.assertEqual(generate_plan(req(servings=0), BASE)["status"], "invalid_request")
        self.assertEqual(generate_plan(req(servings=2.5), BASE)["status"], "invalid_request")
        self.assertEqual(generate_plan(req(budget_php=None), BASE)["status"], "invalid_request")
        w = generate_plan(req(meal_scope="week"), BASE)
        self.assertEqual(w["status"], "invalid_request")
        self.assertIn("not implemented", w["reason_if_no_match"])

    def test_plan_record_shape(self):
        o = generate_plan(req(), BASE)["options"][0]
        rec = option_to_plan_record(o, req())
        for k in ("plan_id", "budget_php", "servings", "meal_scope", "recipe_ids", "price_snapshot_timestamp",
                  "ingredients_to_buy", "estimated_total_php", "budget_remaining_php", "warnings",
                  "created_at", "shopping_status"):
            self.assertIn(k, rec)


class TestPriceImport(unittest.TestCase):
    ROW = {"ingredient": "tilapia", "amount_php": "170", "quantity": "1", "unit": "kg",
           "observed_at": "2026-10-16", "source_type": "official_reference",
           "source_reference": "DA NCR Price Monitoring, 16 Oct 2026, https://example.gov.ph/x.pdf",
           "market_or_area": "NCR", "minimum_purchase_quantity": "0.25"}

    def run_import(self, rows, **kw):
        from datetime import date
        return import_price_rows(rows, fresh_store(), today=date(2026, 10, 17), **kw)

    def test_valid_update_is_accepted_and_becomes_active(self):
        s = fresh_store()
        from datetime import date
        r = import_price_rows([dict(self.ROW)], s, today=date(2026, 10, 17))
        self.assertEqual(len(r["accepted"]), 1)
        s.add_price(r["accepted"][0])
        self.assertEqual(s.active_price("tilapia")["amount_php"], 170)

    def test_real_price_beats_ai_estimate_even_if_older(self):
        s = fresh_store()
        self.assertEqual(s.active_price("kangkong")["source_type"], "demo_seed")
        s.add_price(s.build_price_record("kangkong", 25, 1, "bundle", source_type="official_reference",
                                         observed_at="2025-01-01"))
        self.assertEqual(s.active_price("kangkong")["source_type"], "official_reference")

    def test_alias_and_units_work(self):
        r = self.run_import([dict(self.ROW, ingredient="kamatis", amount_php="32", quantity="250", unit="g")])
        self.assertEqual(r["accepted"][0]["ingredient_id"], "tomato")

    def test_bad_rows_rejected(self):
        bad = [dict(self.ROW, observed_at="2026-12-01"),            # future
               dict(self.ROW, source_type="demo_seed"),             # estimates cannot be imported
               dict(self.ROW, unit="L"),                            # wrong unit for fish
               dict(self.ROW, ingredient="unicorn"),
               dict(self.ROW, amount_php="-5"),
               dict(self.ROW, source_reference="")]
        r = self.run_import(bad)
        self.assertEqual(r["accepted"], [])
        self.assertEqual(len(r["rejected"]), 6)

    def test_big_change_flagged_and_skipped_unless_allowed(self):
        typo = [dict(self.ROW, amount_php="1600")]
        self.assertEqual(self.run_import(typo)["accepted"], [])
        self.assertEqual(len(self.run_import(typo, allow_big_changes=True)["accepted"]), 1)

    def test_duplicate_rejected(self):
        s = fresh_store()
        from datetime import date
        r1 = import_price_rows([dict(self.ROW)], s, today=date(2026, 10, 17))
        s.add_price(r1["accepted"][0])
        r2 = import_price_rows([dict(self.ROW)], s, today=date(2026, 10, 17))
        self.assertIn("duplicate", r2["rejected"][0])

    def test_csv_file_round_trip(self):
        import csv, shutil, tempfile
        tmp = Path(tempfile.mkdtemp())
        for n in ("ingredients.json", "prices.json", "recipes.json"):
            shutil.copy(Path(__file__).resolve().parents[1] / "data" / n, tmp / n)
        f = tmp / "update.csv"
        with open(f, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(self.ROW))
            w.writeheader(); w.writerow(self.ROW)
        from datetime import date
        r = import_csv_file(f, data_dir=tmp, today=date(2026, 10, 17))
        self.assertEqual(len(r["accepted"]), 1)
        s = DataStore.from_json_dir(tmp)
        self.assertEqual(s.active_price("tilapia")["observed_at"], "2026-10-16")
        self.assertEqual(s.validate(), [])


class TestLatency(unittest.TestCase):
    def test_generate_is_fast(self):
        t = time.perf_counter()
        for _ in range(50):
            generate_plan(req(pantry=[{"ingredient_id": "rice"}]), BASE)
        ms = (time.perf_counter() - t) * 1000 / 50
        print(f"\n[measured] generate_plan mean latency on this machine: {ms:.2f} ms over 50 runs")
        self.assertLess(ms, 1000)


if __name__ == "__main__":
    unittest.main()
