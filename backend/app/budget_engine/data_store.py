"""In-memory view of ingredients, prices and recipes for the optimizer.

The backend owns SQLite. It loads rows (plain dicts using the Section 7 field names)
and builds a DataStore with `DataStore.from_records(...)`. For tests / first-time seeding
use `DataStore.from_json_dir(path_to_backend_data)`.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from .units import UnitError, to_base, to_decimal

SOURCE_TYPES = ("official_reference", "user_entered", "demo_seed")
# when two prices share the same observed_at, prefer the more trustworthy one
_SOURCE_PRIORITY = {"user_entered": 3, "official_reference": 2, "demo_seed": 1}

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _norm_text(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _date_str(v) -> str:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return str(v or "")


@dataclass
class DataStore:
    ingredients: dict = field(default_factory=dict)   # ingredient_id -> dict
    prices: list = field(default_factory=list)          # list of price dicts
    recipes: dict = field(default_factory=dict)         # recipe_id -> dict
    allergen_groups: list = field(default_factory=list)  # from data/allergens.json (optional)
    _alias_index: dict = field(default_factory=dict, repr=False)

    # ---------- construction ----------
    @classmethod
    def from_records(cls, ingredients, prices, recipes, allergen_groups=None) -> "DataStore":
        store = cls(
            ingredients={i["ingredient_id"]: dict(i) for i in ingredients},
            prices=[dict(p) for p in prices],
            recipes={r["recipe_id"]: dict(r) for r in recipes},
            allergen_groups=[dict(g) for g in (allergen_groups or [])],
        )
        store._build_alias_index()
        return store

    @classmethod
    def from_json_dir(cls, data_dir=None) -> "DataStore":
        d = Path(data_dir) if data_dir else DEFAULT_DATA_DIR
        load = lambda n: json.loads((d / n).read_text(encoding="utf-8"))
        groups = load("allergens.json")["groups"] if (d / "allergens.json").exists() else []
        return cls.from_records(load("ingredients.json"), load("prices.json"), load("recipes.json"), groups)

    def _build_alias_index(self):
        idx = {}
        for iid, ing in self.ingredients.items():
            for name in [iid, iid.replace("_", " "), ing.get("canonical_name", "")] + list(ing.get("aliases") or []):
                key = _norm_text(name)
                if key:
                    idx.setdefault(key, iid)
        self._alias_index = idx

    # ---------- lookups ----------
    def resolve_ingredient_id(self, name_or_id: str):
        """Map an AI pantry mention / user text ("kanin", "Bawang", "soy sauce") to an ingredient_id, or None."""
        if not name_or_id:
            return None
        if name_or_id in self.ingredients:
            return name_or_id
        key = _norm_text(name_or_id)
        if key in self._alias_index:
            return self._alias_index[key]
        # simple plural / "na" filler tolerance
        for cand in (key.rstrip("s"), key.replace(" na ", " ")):
            if cand in self._alias_index:
                return self._alias_index[cand]
        return None

    def allergen_groups_for_term(self, term: str) -> list:
        """Allergen group ids whose terms include this word (e.g. 'hipon' -> ['crustacean'])."""
        key = _norm_text(term)
        out = []
        for g in self.allergen_groups:
            terms = {_norm_text(t) for t in g.get("terms", [])} | {_norm_text(g["allergen_id"])}
            if key in terms or key.rstrip("s") in terms:
                out.append(g["allergen_id"])
        return out

    def ingredients_with_allergens(self, allergen_ids) -> set:
        wanted = set(allergen_ids)
        return {iid for iid, ing in self.ingredients.items() if wanted & set(ing.get("allergens") or [])}

    def resolve_exclusions(self, terms) -> dict:
        """Turn user words ('shrimp', 'allergic sa isda', ids, aliases, tags) into ingredient ids to exclude.

        Unknown words are returned in `unknown` and must NOT be silently ignored by callers.
        """
        resolved, unknown, ids = [], [], set()
        for raw in terms or []:
            term = str(raw or "").strip()
            if not term:
                continue
            groups = self.allergen_groups_for_term(term)
            hits = self.ingredients_matching_exclusion(term)
            if not hits and not groups:
                unknown.append(term)
                continue
            ids |= hits
            resolved.append({
                "term": term, "allergen_groups": groups,
                "ingredient_ids": sorted(hits),
                "ingredients": [self.ingredients[i]["canonical_name"] for i in sorted(hits)],
            })
        label_check = sorted(i for i, ing in self.ingredients.items()
                             if ing.get("allergen_label_check") and i not in ids)
        return {"excluded_ingredient_ids": sorted(ids), "resolved": resolved, "unknown": unknown,
                "label_check_ingredient_ids": label_check}

    def ingredients_matching_exclusion(self, term: str) -> set:
        """Ingredient ids hit by an exclusion term: an id, an alias, a tag such as 'pork',
        or an allergen word such as 'shrimp' / 'hipon' / 'fish' (via data/allergens.json)."""
        hits = set(self.ingredients_with_allergens(self.allergen_groups_for_term(term)))
        rid = self.resolve_ingredient_id(term)
        if rid:
            hits.add(rid)
        key = _norm_text(term)
        for iid, ing in self.ingredients.items():
            tags = {_norm_text(t) for t in ing.get("tags") or []}
            if key in tags or key.rstrip("s") in tags:
                hits.add(iid)
        return hits

    def active_price(self, ingredient_id: str, market_or_area: str | None = None):
        """Latest usable price for an ingredient, or None.

        Rules: unconfirmed user_entered prices are ignored; any real price (official or user-entered) beats a
        demo_seed AI estimate regardless of date; then a price from the requested area wins;
        otherwise newest observed_at wins; ties prefer user_entered > official_reference > demo_seed.
        """
        cands = []
        for p in self.prices:
            if p.get("ingredient_id") != ingredient_id:
                continue
            if p.get("source_type") == "user_entered" and not p.get("is_user_confirmed", False):
                continue
            area_match = 1 if (market_or_area and p.get("market_or_area") == market_or_area) else 0
            real = 0 if p.get("source_type") == "demo_seed" else 1   # any real price beats an AI estimate
            cands.append(((real, area_match, _date_str(p.get("observed_at")),
                           _SOURCE_PRIORITY.get(p.get("source_type"), 0), str(p.get("price_id", ""))), p))
        if not cands:
            return None
        return max(cands, key=lambda c: c[0])[1]

    # ---------- price upsert helper (backend stores the returned dict) ----------
    def build_price_record(self, ingredient_id, amount_php, quantity, unit, *, market_or_area="user selected",
                           source_type="user_entered", observed_at=None, minimum_purchase_quantity=None,
                           source_reference="Entered by user in Market Mode", is_user_confirmed=True,
                           price_id=None) -> dict:
        """Validate a /api/prices/upsert body and return a normalized price row. Raises ValueError if invalid.

        Pure function: it does NOT modify the store. Backend inserts the row, then calls `add_price`
        (or reloads the store) so the next plan uses it.
        """
        resolved = self.resolve_ingredient_id(ingredient_id)
        if not resolved:
            raise ValueError(f"Unknown ingredient '{ingredient_id}'")
        ing = self.ingredients[resolved]
        amt, qty = to_decimal(amount_php), to_decimal(quantity)
        if amt <= 0:
            raise ValueError("amount_php must be greater than 0")
        if qty <= 0:
            raise ValueError("quantity must be greater than 0")
        if source_type not in SOURCE_TYPES:
            raise ValueError(f"source_type must be one of {SOURCE_TYPES}")
        to_base(qty, unit, ing["base_unit"])  # raises UnitError on incompatible unit
        observed = _date_str(observed_at) or datetime.now().isoformat(timespec="seconds")
        return {
            "price_id": price_id or f"{source_type}-{resolved}-{observed}",
            "ingredient_id": resolved, "amount_php": float(amt), "quantity": float(qty), "unit": unit,
            "minimum_purchase_quantity": minimum_purchase_quantity,
            "market_or_area": market_or_area, "observed_at": observed, "source_type": source_type,
            "source_reference": source_reference, "is_user_confirmed": bool(is_user_confirmed),
        }

    def add_price(self, price_record: dict):
        self.prices.append(dict(price_record))

    # ---------- dataset validation ----------
    def validate(self) -> list:
        """Return a list of human-readable problems (empty list = dataset is consistent)."""
        problems = []
        for iid, ing in self.ingredients.items():
            if ing.get("base_unit") not in ("g", "ml", "piece"):
                problems.append(f"ingredient {iid}: base_unit must be g/ml/piece")
            inc = ing.get("default_purchase_increment")
            if inc is not None and to_decimal(inc) <= 0:
                problems.append(f"ingredient {iid}: default_purchase_increment must be > 0")
        for p in self.prices:
            pid, iid = p.get("price_id"), p.get("ingredient_id")
            if iid not in self.ingredients:
                problems.append(f"price {pid}: unknown ingredient {iid}")
                continue
            if p.get("source_type") not in SOURCE_TYPES:
                problems.append(f"price {pid}: bad source_type {p.get('source_type')}")
            if not p.get("observed_at"):
                problems.append(f"price {pid}: missing observed_at")
            try:
                to_base(p["quantity"], p["unit"], self.ingredients[iid]["base_unit"])
                if to_decimal(p["amount_php"]) <= 0 or to_decimal(p["quantity"]) <= 0:
                    problems.append(f"price {pid}: amount and quantity must be > 0")
            except (UnitError, KeyError, ValueError) as e:
                problems.append(f"price {pid}: {e}")
        for rid, r in self.recipes.items():
            if int(r.get("base_servings") or 0) <= 0:
                problems.append(f"recipe {rid}: base_servings must be > 0")
            if not r.get("steps"):
                problems.append(f"recipe {rid}: no steps")
            seen = set()
            for ri in r.get("ingredients", []):
                iid = ri.get("ingredient_id")
                if iid not in self.ingredients:
                    problems.append(f"recipe {rid}: unknown ingredient {iid}")
                    continue
                if iid in seen:
                    problems.append(f"recipe {rid}: duplicate ingredient {iid}")
                seen.add(iid)
                try:
                    to_base(ri["quantity"], ri["unit"], self.ingredients[iid]["base_unit"])
                except (UnitError, KeyError, ValueError) as e:
                    problems.append(f"recipe {rid} / {iid}: {e}")
                for s in ri.get("substitutions") or []:
                    sid = s.get("ingredient_id")
                    if sid not in self.ingredients:
                        problems.append(f"recipe {rid}: substitution {sid} unknown")
                        continue
                    try:
                        to_base(s["quantity"], s["unit"], self.ingredients[sid]["base_unit"])
                    except (UnitError, KeyError, ValueError) as e:
                        problems.append(f"recipe {rid} / substitution {sid}: {e}")
                if not ri.get("optional") and self.active_price(iid) is None:
                    problems.append(f"recipe {rid}: required ingredient {iid} has no usable price")
        return problems
