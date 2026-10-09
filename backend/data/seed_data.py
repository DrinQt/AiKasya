"""Seed data for the AIKasya SQLite database.

Single source of truth: the Data Science dataset in this folder
(ingredients.json, recipes.json, prices.json), maintained by the Data Science lead.
  - prices: official PSA (Sep 2026) / DA (Mar 2025) / DTI (Feb 2025) figures with cited sources,
    or clearly labeled demo_seed estimates. See data/sources/ and DS_HANDOFF_FOR_BACKEND.md.
  - weekly price updates: run `python ds_update_prices.py <file.csv>`, then rebuild aikasya.db.

The lists below keep the shape app/database.py expects (INGREDIENTS_SEED, PRICES_SEED, RECIPES_SEED).
Only the ACTIVE price per ingredient is seeded (same rule the Data Science engine uses).
"""
from typing import Any, Dict, List

from app.budget_engine import DataStore, to_base

_store = DataStore.from_json_dir()


def _increment_in_base_units(ing: Dict[str, Any], price: Dict[str, Any]) -> float:
    """Smallest amount a vendor sells, in the ingredient base unit (g / ml / piece)."""
    inc = ing.get("default_purchase_increment")
    if inc:
        return float(inc)
    if price.get("minimum_purchase_quantity"):
        return float(to_base(price["minimum_purchase_quantity"], price["unit"], ing["base_unit"]))
    return 0.0


INGREDIENTS_SEED: List[Dict[str, Any]] = [
    {
        "ingredient_id": iid,
        "canonical_name": ing["canonical_name"],
        "aliases": ing.get("aliases", []),
        "category": ing["category"],
        "base_unit": ing["base_unit"],
        "default_purchase_increment": float(ing.get("default_purchase_increment") or 0),
        "storage_notes": ing.get("storage_notes", ""),
    }
    for iid, ing in _store.ingredients.items()
]

PRICES_SEED: List[Dict[str, Any]] = []
for _iid, _ing in _store.ingredients.items():
    _p = _store.active_price(_iid)
    if _p is None:
        continue  # never invent a price; the engine reports the recipe as unpriced
    PRICES_SEED.append({
        "ingredient_id": _iid,
        "amount_php": float(_p["amount_php"]),
        "quantity": float(_p["quantity"]),
        "unit": _p["unit"],
        "minimum_purchase_quantity": _increment_in_base_units(_ing, _p),
        "market_or_area": _p.get("market_or_area") or "",
        "observed_at": str(_p.get("observed_at"))[:10],
        "source_type": _p["source_type"],
        "source_reference": _p.get("source_reference", ""),
    })

RECIPES_SEED: List[Dict[str, Any]] = []
for _r in _store.recipes.values():
    _lines = []
    for _line in _r["ingredients"]:
        _lines.append({
            "ingredient_id": _line["ingredient_id"],
            "name": _store.ingredients[_line["ingredient_id"]]["canonical_name"],
            "quantity": float(_line["quantity"]),
            "unit": _line["unit"],
            "optional": bool(_line.get("optional", False)),
            "substitutions": [s["ingredient_id"] for s in _line.get("substitutions") or []],
            "substitution_details": [
                {"ingredient_id": s["ingredient_id"], "quantity": float(s["quantity"]), "unit": s["unit"],
                 "name": _store.ingredients[s["ingredient_id"]]["canonical_name"]}
                for s in _line.get("substitutions") or []
            ],
            **({"note": _line["note"]} if _line.get("note") else {}),
        })
    RECIPES_SEED.append({
        "recipe_id": _r["recipe_id"],
        "name": _r["name"],
        "category": _r["category"],
        "meal_types": _r.get("meal_types", []),
        "base_servings": int(_r["base_servings"]),
        "prep_minutes": int(_r["prep_minutes"]),
        "cook_minutes": int(_r["cook_minutes"]),
        "source_title": _r.get("source_title", ""),
        "source_url_or_note": _r.get("source_url_or_note", ""),
        "rights_status": _r.get("rights_status", ""),
        "steps": list(_r["steps"]),
        "ingredients": _lines,
    })
