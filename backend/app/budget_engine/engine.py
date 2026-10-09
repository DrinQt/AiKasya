"""AIKasya budget-to-meal engine (Data Science P0).

Algorithm (honest description for the pitch / disclosures):
  exhaustive enumeration over the curated local recipe library -> exact purchasable cost per recipe
  (scaling, unit conversion, pantry subtraction, vendor increments, Decimal money) -> hard-constraint
  filter (budget, exclusions, meal type, time) -> transparent weighted score -> top N options.
It is deterministic arithmetic, not machine learning and not a solver.

Public functions (all return JSON-serializable dicts; money as floats rounded to centavos):
  generate_plan(request, store)            -> POST /api/plans/generate response (Section 9.2)
  reprice_plan(request, recipe_id, store)  -> POST /api/plans/reprice response
  evaluate_recipe(recipe_id, request, store)
  pantry_after_cooking(pantry, option)     -> new pantry rows (call ONLY after user confirms cooking)
  option_to_plan_record(option, request)   -> Section 7 "plans" row
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from .data_store import DataStore
from .units import UnitError, to_base, to_decimal

CENT = Decimal("0.01")
MAX_BUDGET = Decimal("1000000")
MAX_SERVINGS = 50
ALLOWED_MEAL_TYPES = {None, "breakfast", "lunch", "dinner", "snack"}
ALLOWED_SCOPES = {"single_meal", "day", "week", "month"}
IMPLEMENTED_SCOPES = {"single_meal"}

# Ranking weights (shown to users via score_reasons). Sum to 1.0 when no preferences are given.
W_CUSHION, W_PANTRY, W_TIME, W_PREF = Decimal("0.45"), Decimal("0.35"), Decimal("0.20"), Decimal("0.15")
TIME_CAP_MIN = Decimal("90")
STALE_DAYS = 90   # official prices older than this get a "may be outdated" warning

ALGORITHM_NOTE = ("Exhaustive enumeration of the local recipe library with exact cost computation "
                  "and a transparent weighted score (budget cushion, pantry reuse, cooking time).")


# ----------------------------------------------------------------- helpers
def _money(d: Decimal) -> float:
    return float(d.quantize(CENT, rounding=ROUND_HALF_UP))


def _qty(d: Decimal):
    d = d.normalize()
    return int(d) if d == d.to_integral_value() else float(d)


def _fmt_qty(d: Decimal, base_unit: str, count_label: str | None) -> str:
    if base_unit == "piece":
        n = _qty(d)
        label = count_label or "piece"
        return f"{n} {label}{'' if n == 1 else 's'}"
    if base_unit == "g" and d >= 1000:
        return f"{_qty(d / 1000)} kg"
    if base_unit == "ml" and d >= 1000:
        return f"{_qty(d / 1000)} L"
    return f"{_qty(d)} {base_unit}"


def _days_old(iso_date: str) -> int:
    try:
        return (datetime.now().date() - datetime.fromisoformat(iso_date[:10]).date()).days
    except ValueError:
        return 0


def _ceil_to(x: Decimal, inc: Decimal) -> Decimal:
    return (x / inc).to_integral_value(rounding=ROUND_CEILING) * inc


class _Params:
    """Validated generate/reprice request."""

    def __init__(self):
        self.errors, self.warnings = [], []
        self.budget = Decimal("0")
        self.servings = 0
        self.meal_scope = "single_meal"
        self.meal_type = None
        self.max_minutes = None
        self.pantry = {}          # ingredient_id -> Decimal base qty, or None = "has it, quantity unknown"
        self.purchased = {}       # ingredient_id -> Decimal base qty already bought in Market Mode
        self.spent = Decimal("0")
        self.excluded = set()
        self.preferred = set()
        self.include_rice = True
        self.area = None


def parse_request(request: dict, store: DataStore) -> _Params:
    p = _Params()
    r = request or {}

    try:
        p.budget = to_decimal(r.get("budget_php"))
        if p.budget <= 0 or p.budget > MAX_BUDGET:
            p.errors.append("budget_php must be greater than 0")
    except Exception:
        p.errors.append("budget_php is required and must be a number")

    try:
        s = r.get("servings")
        if s is None or isinstance(s, bool) or int(s) != to_decimal(s):
            raise ValueError
        p.servings = int(s)
        if not 1 <= p.servings <= MAX_SERVINGS:
            p.errors.append(f"servings must be between 1 and {MAX_SERVINGS}")
    except Exception:
        p.errors.append("servings is required and must be a whole number")

    p.meal_scope = r.get("meal_scope") or "single_meal"
    if p.meal_scope not in ALLOWED_SCOPES:
        p.errors.append(f"meal_scope must be one of {sorted(ALLOWED_SCOPES)}")
    elif p.meal_scope not in IMPLEMENTED_SCOPES:
        p.errors.append(f"meal_scope '{p.meal_scope}' is not implemented yet; only single_meal plans are "
                        "available in this version")

    p.meal_type = r.get("meal_type")
    if isinstance(p.meal_type, str):
        p.meal_type = p.meal_type.strip().lower() or None
    if p.meal_type not in ALLOWED_MEAL_TYPES:
        p.errors.append("meal_type must be breakfast, lunch, dinner, snack or null")

    mm = r.get("max_prep_minutes")
    if mm is not None:
        try:
            p.max_minutes = to_decimal(mm)
            if p.max_minutes <= 0:
                raise ValueError
        except Exception:
            p.errors.append("max_prep_minutes must be a positive number or null")

    # pantry: [{ingredient_id, quantity?, unit?}]; quantity null = user says they have it
    for item in r.get("pantry") or []:
        raw = item.get("ingredient_id") or item.get("name")
        iid = store.resolve_ingredient_id(raw)
        if not iid:
            p.warnings.append(f"Pantry item '{raw}' is not in the local ingredient list and was ignored.")
            continue
        q = item.get("quantity")
        if q is None:
            p.pantry[iid] = None
            continue
        try:
            base = to_base(q, item.get("unit") or store.ingredients[iid]["base_unit"],
                           store.ingredients[iid]["base_unit"])
            if base < 0:
                raise ValueError("negative quantity")
        except (UnitError, ValueError) as e:
            p.errors.append(f"Pantry item '{raw}': {e}")
            continue
        if iid in p.pantry and p.pantry[iid] is None:
            continue
        p.pantry[iid] = p.pantry.get(iid, Decimal("0")) + base

    # Market Mode: items already bought -> money already spent + stock on hand
    for item in r.get("already_purchased") or []:
        iid = store.resolve_ingredient_id(item.get("ingredient_id"))
        if not iid:
            p.errors.append(f"already_purchased: unknown ingredient '{item.get('ingredient_id')}'")
            continue
        try:
            base = to_base(item["quantity"], item.get("unit") or store.ingredients[iid]["base_unit"],
                           store.ingredients[iid]["base_unit"])
            cost = to_decimal(item["cost_php"])
            if cost < 0 or base < 0:
                raise ValueError("negative value")
        except (KeyError, UnitError, ValueError) as e:
            p.errors.append(f"already_purchased '{iid}': needs quantity, unit and cost_php ({e})")
            continue
        p.purchased[iid] = p.purchased.get(iid, Decimal("0")) + base
        p.spent += cost

    for term in (r.get("excluded_ingredient_ids") or []):
        hits = store.ingredients_matching_exclusion(term)
        if hits:
            p.excluded |= hits
        else:
            p.warnings.append(f"Exclusion '{term}' did not match any ingredient in the local library.")

    for term in (r.get("preferred_ingredient_ids") or []):
        iid = store.resolve_ingredient_id(term)
        if iid:
            p.preferred.add(iid)

    p.include_rice = bool(r.get("include_rice_side", True))
    p.area = r.get("market_or_area")
    return p


# ----------------------------------------------------------------- core evaluation
def _evaluate(recipe: dict, p: _Params, store: DataStore) -> dict:
    """Evaluate one recipe. Returns {'status', 'reason', 'option', 'missing_prices'}.

    status: feasible | over_budget | needs_price_data | excluded | filtered
    """
    rid = recipe["recipe_id"]
    total_min = int(recipe.get("prep_minutes") or 0) + int(recipe.get("cook_minutes") or 0)
    if p.meal_type and p.meal_type not in (recipe.get("meal_types") or []):
        return {"status": "filtered", "reason": f"not a {p.meal_type} recipe"}
    if p.max_minutes is not None and total_min > p.max_minutes:
        return {"status": "filtered", "reason": f"takes {total_min} min (limit {p.max_minutes})"}

    scale = Decimal(p.servings) / Decimal(int(recipe["base_servings"]))
    warnings, optional_skipped, subs_applied = [], [], []
    required = {}          # iid -> Decimal base qty (required lines)
    optional_needed = {}   # iid -> Decimal base qty (optional lines, used only if on hand)
    required_lines = 0

    for line in recipe["ingredients"]:
        if line.get("role") == "rice_side" and not p.include_rice:
            continue
        iid, qty, unit = line["ingredient_id"], line["quantity"], line["unit"]
        name = store.ingredients[iid]["canonical_name"]
        if iid in p.excluded:
            if line.get("optional"):
                optional_skipped.append(f"{name} (excluded)")
                continue
            sub = next((s for s in line.get("substitutions") or [] if s["ingredient_id"] not in p.excluded), None)
            if not sub:
                return {"status": "excluded", "reason": f"needs {name}, which is excluded"}
            subs_applied.append(f"{name} -> {store.ingredients[sub['ingredient_id']]['canonical_name']}")
            iid, qty, unit = sub["ingredient_id"], sub["quantity"], sub["unit"]
        base = to_base(qty, unit, store.ingredients[iid]["base_unit"]) * scale
        if line.get("optional"):
            optional_needed[iid] = optional_needed.get(iid, Decimal("0")) + base
        else:
            required[iid] = required.get(iid, Decimal("0")) + base
            required_lines += 1

    # optional items: use only what is on hand, never buy
    for iid, need in optional_needed.items():
        have = p.pantry.get(iid, Decimal("0")) if iid in p.pantry else Decimal("0")
        if iid in p.pantry and (have is None or have > 0):
            required.setdefault(iid, Decimal("0"))
            # treat on-hand optional as a covered requirement (capped at what is available)
            required[iid] += need if have is None else min(need, have)
        else:
            optional_skipped.append(store.ingredients[iid]["canonical_name"])

    items, pantry_used, missing = [], [], []
    new_cost = Decimal("0")
    covered_lines = 0
    snapshot = ""
    demo_seed_used = False
    oldest_official = None

    for iid in sorted(required):
        need = required[iid]
        ing = store.ingredients[iid]
        base_unit, label = ing["base_unit"], ing.get("count_label")
        remaining_need = need

        # 1) stock already bought in Market Mode
        bought = p.purchased.get(iid, Decimal("0"))
        if bought > 0:
            use = min(bought, remaining_need)
            pantry_used.append({"ingredient_id": iid, "name": ing["canonical_name"], "quantity": _qty(use),
                                "unit": base_unit, "source": "already_purchased", "assumed_sufficient": False})
            remaining_need -= use
        # 2) pantry
        if remaining_need > 0 and iid in p.pantry:
            have = p.pantry[iid]
            if have is None:
                pantry_used.append({"ingredient_id": iid, "name": ing["canonical_name"],
                                    "quantity": _qty(remaining_need), "unit": base_unit, "source": "pantry",
                                    "assumed_sufficient": True})
                warnings.append(f"Assumed you have at least {_fmt_qty(remaining_need, base_unit, label)} of "
                                f"{ing['canonical_name']} at home; please verify.")
                remaining_need = Decimal("0")
            elif have > 0:
                use = min(have, remaining_need)
                pantry_used.append({"ingredient_id": iid, "name": ing["canonical_name"], "quantity": _qty(use),
                                    "unit": base_unit, "source": "pantry", "assumed_sufficient": False})
                remaining_need -= use
        if remaining_need < need:
            covered_lines += 1
        if remaining_need <= 0:
            continue

        # 3) buy the shortfall
        price = store.active_price(iid, p.area)
        if price is None:
            missing.append(iid)
            continue
        price_qty_base = to_base(price["quantity"], price["unit"], base_unit)
        unit_price = to_decimal(price["amount_php"]) / price_qty_base
        if price.get("purchase_increment"):
            inc = to_base(price["purchase_increment"], price["unit"], base_unit)
        elif ing.get("default_purchase_increment"):
            inc = to_decimal(ing["default_purchase_increment"])
        else:
            inc = None
        min_q = (to_base(price["minimum_purchase_quantity"], price["unit"], base_unit)
                 if price.get("minimum_purchase_quantity") else Decimal("0"))
        buy = _ceil_to(remaining_need, inc) if inc else remaining_need
        if buy < min_q:
            buy = _ceil_to(min_q, inc) if inc else min_q
        cost = (buy * unit_price).quantize(CENT, rounding=ROUND_HALF_UP)
        new_cost += cost
        obs = str(price.get("observed_at") or "")
        snapshot = max(snapshot, obs)
        demo_seed_used |= price.get("source_type") == "demo_seed"
        if price.get("source_type") == "official_reference" and obs:
            oldest_official = min(oldest_official or obs[:10], obs[:10])

        if inc and inc == price_qty_base and base_unit != "piece":
            n = _qty(buy / inc)
            pack_note = f"{n} pack{'' if n == 1 else 's'} of {_fmt_qty(inc, base_unit, label)}"
        else:
            pack_note = _fmt_qty(buy, base_unit, label)
        items.append({
            "ingredient_id": iid, "name": ing["canonical_name"], "quantity": _qty(buy), "unit": base_unit,
            "cost_php": _money(cost), "price_source_type": price.get("source_type"),
            "price_observed_at": obs[:10] if obs else None,
            # additive fields (frontend may ignore)
            "price_id": price.get("price_id"),
            "price_reference": f"PHP {_money(to_decimal(price['amount_php'])):.2f} per {_qty(to_decimal(price['quantity']))} {price['unit']}",
            "required_quantity": _qty(remaining_need), "pack_note": pack_note, "unit_label": label,
        })

    if missing:
        names = [store.ingredients[i]["canonical_name"] for i in missing]
        return {"status": "needs_price_data", "missing_prices": missing,
                "reason": "no local price for " + ", ".join(names)}

    total = p.spent + new_cost
    remaining = p.budget - total
    if demo_seed_used:
        warnings.append("Some prices are DEMO estimates (AI-generated, demo_seed), not market quotes. "
                        "Update them in Market Mode.")
    if oldest_official and _days_old(oldest_official) > STALE_DAYS:
        warnings.append(f"Official reference prices (DA/DTI) date back to {oldest_official}; today's market "
                        "prices may differ. Update them in Market Mode.")
    if optional_skipped:
        warnings.append("Optional, not included in cost: " + ", ".join(optional_skipped) + ".")
    if subs_applied:
        warnings.append("Substituted because of your exclusions: " + "; ".join(subs_applied) + ".")

    option = {
        "recipe_id": rid, "recipe_name": recipe["name"], "servings": p.servings,
        "estimated_total_php": _money(total), "remaining_php": _money(remaining),
        "items_to_buy": items, "pantry_items_used": pantry_used, "warnings": warnings,
        # additive fields
        "new_purchases_php": _money(new_cost), "already_spent_php": _money(p.spent),
        "prep_minutes": int(recipe.get("prep_minutes") or 0), "cook_minutes": int(recipe.get("cook_minutes") or 0),
        "total_minutes": total_min, "optional_items_skipped": optional_skipped,
        "substitutions_applied": subs_applied, "price_snapshot_timestamp": snapshot or None,
    }

    # transparent score
    cushion = max(Decimal("0"), remaining) / p.budget
    pantry_ratio = Decimal(covered_lines) / Decimal(max(1, len(required)))
    time_score = Decimal("1") - min(Decimal(total_min), TIME_CAP_MIN) / TIME_CAP_MIN
    score = W_CUSHION * cushion + W_PANTRY * pantry_ratio + W_TIME * time_score
    reasons = [f"leaves PHP {_money(max(Decimal('0'), remaining))} of PHP {_money(p.budget)}",
               f"uses {covered_lines} of {len(required)} ingredients you already have",
               f"about {total_min} minutes total"]
    if p.preferred:
        hit = len(p.preferred & set(required)) / Decimal(len(p.preferred))
        score = (score + W_PREF * hit) / (Decimal("1") + W_PREF)
        reasons.append(f"matches {int(hit * len(p.preferred))} of your preferred ingredients")
    option["score"] = float(score.quantize(Decimal("0.0001")))
    option["score_reasons"] = reasons

    status = "feasible" if total <= p.budget else "over_budget"
    return {"status": status, "option": option,
            "reason": None if status == "feasible" else f"costs PHP {_money(total)}, over by PHP {_money(-remaining)}"}


def _rank(options: list) -> list:
    return sorted(options, key=lambda o: (-o["score"], o["estimated_total_php"], o["recipe_id"]))


def _invalid(p: _Params, budget) -> dict:
    return {"status": "invalid_request", "budget_php": budget, "options": [],
            "reason_if_no_match": "; ".join(p.errors), "errors": p.errors, "warnings": p.warnings}


def _budget_out(request):
    try:
        return _money(to_decimal(request.get("budget_php")))
    except Exception:
        return request.get("budget_php") if request else None


# ----------------------------------------------------------------- public API
def generate_plan(request: dict, store: DataStore, max_options: int = 3) -> dict:
    """POST /api/plans/generate. Returns the Section 9.2 response (plus additive fields)."""
    p = parse_request(request, store)
    if p.errors:
        return _invalid(p, _budget_out(request))

    results = [_evaluate(r, p, store) for r in store.recipes.values()]
    feasible = [x["option"] for x in results if x["status"] == "feasible"]
    over = [x["option"] for x in results if x["status"] == "over_budget"]
    unpriced = [x for x in results if x["status"] == "needs_price_data"]
    candidates = [x for x in results if x["status"] not in ("filtered", "excluded")]

    resp = {"status": None, "budget_php": _money(p.budget), "options": [], "reason_if_no_match": None,
            "warnings": list(p.warnings), "evaluated_recipe_count": len(results),
            "feasible_recipe_count": len(feasible), "algorithm": ALGORITHM_NOTE}

    if feasible:
        resp["status"] = "feasible"
        resp["options"] = _rank(feasible)[:max_options]
        if unpriced:
            resp["warnings"].append(f"{len(unpriced)} recipe(s) were skipped because a price is missing.")
        return resp

    if unpriced and not over:
        missing = sorted({i for x in unpriced for i in x["missing_prices"]})
        resp["status"] = "needs_price_data"
        resp["missing_price_ingredient_ids"] = missing
        resp["reason_if_no_match"] = ("Cannot finish costing: please enter a price for " +
                                      ", ".join(store.ingredients[i]["canonical_name"] for i in missing) + ".")
        return resp

    resp["status"] = "no_match"
    if not candidates:
        resp["reason_if_no_match"] = ("No recipe in our current local library matches your meal type, "
                                      "time limit and exclusions.")
        return resp
    msg = "No recipe in our current local library fits all your constraints at these prices."
    suggestions = []
    if over:
        cheapest = min(over, key=lambda o: (o["estimated_total_php"], o["recipe_id"]))
        msg += (f" The closest is {cheapest['recipe_name']} at PHP {cheapest['estimated_total_php']:.2f} "
                f"(PHP {-cheapest['remaining_php']:.2f} over).")
        suggestions.append({"type": "increase_budget", "budget_php": cheapest["estimated_total_php"],
                            "recipe_id": cheapest["recipe_id"]})
        # largest smaller serving count that has a feasible plan (suggestion only; never applied silently)
        for s in range(p.servings - 1, 0, -1):
            p.servings = s
            if any(_evaluate(r, p, store)["status"] == "feasible" for r in store.recipes.values()):
                suggestions.append({"type": "reduce_servings", "servings": s})
                msg += f" With {s} serving{'s' if s > 1 else ''} at least one recipe fits."
                break
        msg += " Would you like to change the budget or servings?"
    if unpriced:
        msg += f" {len(unpriced)} recipe(s) could not be costed because a price is missing."
        resp["missing_price_ingredient_ids"] = sorted({i for x in unpriced for i in x["missing_prices"]})
    resp["reason_if_no_match"] = msg
    resp["suggested_changes"] = suggestions
    return resp


def evaluate_recipe(recipe_id: str, request: dict, store: DataStore) -> dict:
    """Cost one specific recipe (feasible or not). Useful for recipe-detail screens."""
    p = parse_request(request, store)
    if p.errors:
        return _invalid(p, _budget_out(request))
    if recipe_id not in store.recipes:
        return {"status": "invalid_request", "reason": f"Unknown recipe_id '{recipe_id}'", "option": None}
    out = _evaluate(store.recipes[recipe_id], p, store)
    return {"status": out["status"], "reason": out.get("reason"), "option": out.get("option"),
            "missing_price_ingredient_ids": out.get("missing_prices", []), "warnings": p.warnings}


def reprice_plan(request: dict, recipe_id: str, store: DataStore, previous_total_php=None,
                 max_options: int = 3) -> dict:
    """POST /api/plans/reprice: re-cost the chosen recipe with the latest local prices.

    Pass Market Mode purchases in request["already_purchased"] so money already spent stays counted.
    If the chosen recipe no longer fits, `alternatives` holds feasible replacements (never auto-switched).
    """
    sel = evaluate_recipe(recipe_id, request, store)
    if sel["status"] == "invalid_request":
        return {**sel, "budget_php": _budget_out(request), "alternatives": []}
    option = sel.get("option")
    still = sel["status"] == "feasible"
    resp = {"status": sel["status"], "budget_php": _budget_out(request), "selected_recipe_id": recipe_id,
            "selected_still_feasible": still, "selected_option": option,
            "previous_total_php": previous_total_php,
            "new_total_php": option["estimated_total_php"] if option else None,
            "delta_php": (round(option["estimated_total_php"] - float(previous_total_php), 2)
                          if option and previous_total_php is not None else None),
            "reason": sel.get("reason"), "alternatives": [], "warnings": sel.get("warnings", [])}
    if not still:
        alt = generate_plan(request, store, max_options=max_options + 1)
        resp["alternatives"] = [o for o in alt.get("options", []) if o["recipe_id"] != recipe_id][:max_options]
        resp["alternatives_status"] = alt["status"]
        if not resp["alternatives"]:
            resp["reason"] = (resp["reason"] or "") + "; " + (alt.get("reason_if_no_match") or "no alternative fits")
    return resp


def pantry_after_cooking(pantry: list, option: dict) -> list:
    """Return updated pantry rows after the user CONFIRMS they cooked `option`.

    Only rows with known quantities are reduced. Never call automatically.
    """
    used = {}
    for u in option.get("pantry_items_used", []):
        if u.get("source") == "pantry" and not u.get("assumed_sufficient"):
            used[u["ingredient_id"]] = used.get(u["ingredient_id"], Decimal("0")) + to_decimal(u["quantity"])
    out = []
    for row in pantry:
        row = dict(row)
        iid = row.get("ingredient_id")
        if iid in used and row.get("quantity") is not None:
            # pantry rows are assumed to be in the same base unit the engine reports (g/ml/piece)
            row["quantity"] = _qty(max(Decimal("0"), to_decimal(row["quantity"]) - used[iid]))
            row["updated_at"] = datetime.now().isoformat(timespec="seconds")
        out.append(row)
    return out


def option_to_plan_record(option: dict, request: dict, plan_id: str | None = None) -> dict:
    """Section 7 'plans' row for the backend to store."""
    return {
        "plan_id": plan_id or str(uuid.uuid4()),
        "budget_php": _budget_out(request), "servings": option["servings"],
        "meal_scope": (request or {}).get("meal_scope") or "single_meal",
        "recipe_ids": [option["recipe_id"]],
        "price_snapshot_timestamp": option.get("price_snapshot_timestamp"),
        "ingredients_to_buy": option["items_to_buy"],
        "estimated_total_php": option["estimated_total_php"],
        "budget_remaining_php": option["remaining_php"],
        "warnings": option["warnings"],
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "shopping_status": "not_started",
    }
