# AIKasya - Data Science module (budget-to-meal engine)

Owner: Data Science lead (James Kalaw). Pure Python 3.10+, standard library only (decimal, json, dataclasses). No pip installs, no network calls.

## What it does

- Scales each curated recipe to the requested servings and converts units (kg/g, L/mL/tbsp/tsp/cup, piece/bundle/can/sachet).
- Subtracts pantry stock and Market Mode purchases, then rounds the shortfall up to how vendors actually sell (250 g steps, 200 ml packs, whole bundles).
- Computes exact peso cost with `Decimal`, rounded to centavos per item. The displayed item sum always equals the total.
- Filters on hard constraints (budget, exclusions, meal type, time) and ranks feasible meals with a transparent score: 45% budget cushion, 35% pantry reuse, 20% cooking time (plus 15% preferences when given).
- Returns `no_match`, `needs_price_data` or `invalid_request` honestly. It never invents a recipe or a price, and never prices anything at PHP 0.

Algorithm, for the pitch and disclosures: exhaustive enumeration of the local recipe library plus exact cost computation and a weighted score. This is not machine learning and not a solver.

## Files

| Path | Purpose |
|---|---|
| `backend/app/budget_engine/units.py` | Unit normalization (g / ml / piece base units) |
| `backend/app/budget_engine/data_store.py` | `DataStore`: lookups, alias resolution, active-price selection, price validation, dataset checks |
| `backend/app/budget_engine/engine.py` | `generate_plan`, `reprice_plan`, `evaluate_recipe`, `pantry_after_cooking`, `option_to_plan_record` |
| `backend/app/budget_engine/demo.py` | Offline demo: `python -m app.budget_engine.demo` |
| `backend/data/ingredients.json` | 45 ingredients (Section 7 fields + `tags`, `count_label`) |
| `backend/data/prices.json` | Price rows with history: PSA Sep 2026, DA/DTI 2025, labeled AI estimates |
| `backend/data/sources/` | Original PSA September 2026 workbook (kept for audit) |
| `backend/data/price_updates/` | Weekly update CSVs, TEMPLATE.csv, PSA workbook converter |
| `backend/data/apply_official_prices.py` | Rebuilds prices.json from the cited official figures (idempotent) |
| `backend/data/recipes.json` | 19 Filipino recipes (16 ulam, 3 fruit/merienda), steps written for this project |
| `backend/app/budget_engine/price_import.py` | Validates a CSV of new prices and appends them as dated history |
| `backend/ds_update_prices.py` | Weekly update command: `python ds_ds_update_prices.py <file.csv>` |
| `backend/data/price_updates/TEMPLATE.csv` | Blank CSV to copy for each price update |
| `backend/tests/test_optimization.py` | 49 tests covering the Section 12 test matrix |

## Integration for the backend lead

1. Build one `DataStore` at startup, either from SQLite rows (plain dicts, Section 7 field names) or from the seed JSON.
2. Call the functions from the routes. Request and response bodies are plain dicts matching Section 9.

```python
from fastapi import APIRouter, HTTPException
from app.budget_engine import DataStore, generate_plan, reprice_plan

router = APIRouter(prefix="/api")
STORE = DataStore.from_json_dir()   # or DataStore.from_records(ingredient_rows, price_rows, recipe_rows)

@router.post("/plans/generate")
def plans_generate(body: dict):
    return generate_plan(body, STORE)

@router.post("/plans/reprice")
def plans_reprice(body: dict):
    # body = {"request": <same shape as /plans/generate>, "recipe_id": "...", "previous_total_php": 193.0}
    return reprice_plan(body["request"], body["recipe_id"], STORE, body.get("previous_total_php"))

@router.post("/prices/upsert")
def prices_upsert(body: dict):
    try:
        row = STORE.build_price_record(**body)   # validates ingredient, amount > 0, compatible unit
    except ValueError as e:                      # UnitError is a ValueError
        raise HTTPException(status_code=422, detail=str(e))
    # INSERT row into the SQLite prices table here, then:
    STORE.add_price(row)
    return row
```

Wiring the Local AI output (`/api/agent/interpret`) into a plan request:

```python
plan_request = {
    "budget_php": ai["budget_php"],
    "servings": ai["servings"],
    "meal_scope": ai["meal_scope"],
    "meal_type": ai["meal_type"],
    "pantry": [{"ingredient_id": m} for m in ai["pantry_mentions"]],   # names like "kanin" resolve via aliases
    "excluded_ingredient_ids": ai["excluded_ingredients"],             # ids, aliases or tags like "pork", "seafood"
    "max_prep_minutes": ai["max_prep_minutes"],
}
```

## Request fields

The Section 9.2 fields are unchanged. Optional extra request fields:

- `already_purchased`: `[{ingredient_id, quantity, unit, cost_php}]` from the Market Mode checkboxes. The money counts as spent, and the stock counts as on hand.
- `preferred_ingredient_ids`: list of ids or aliases; adds a preference term to the score.
- `include_rice_side`: default `true`. Ulam recipes include 100 g uncooked rice per serving as a side.
- `market_or_area`: prefer prices from this area when present.
- Pantry `quantity` may be null. It is then treated as "has it, enough", and the option carries a "please verify" warning.

## Response fields (additive, frontend may ignore)

- Top level: `warnings`, `evaluated_recipe_count`, `feasible_recipe_count`, `algorithm`, `suggested_changes` (on `no_match`), `missing_price_ingredient_ids`.
- Per option: `new_purchases_php`, `already_spent_php`, `prep_minutes`, `cook_minutes`, `total_minutes`, `score`, `score_reasons`, `optional_items_skipped`, `substitutions_applied`, `price_snapshot_timestamp`.
- Per item: `price_id`, `price_reference`, `required_quantity`, `pack_note` (for example "2 bundles", "1 pack of 200 ml"), `unit_label`.
- Quantities are always in the ingredient base unit: `g`, `ml` or `piece`.

## Reprice response

- `status`: `feasible`, `over_budget`, `needs_price_data`, `excluded`, `filtered` or `invalid_request`. This is the status of the selected recipe.
- Other fields: `selected_still_feasible`, `selected_option`, `previous_total_php`, `new_total_php`, `delta_php`, `alternatives`.
- Alternatives are suggestions only. The engine never switches the recipe automatically.

## Rules the engine enforces

- Active price: the newest `observed_at` wins (area match first). Ties prefer user_entered, then official_reference, then demo_seed. A `user_entered` price with `is_user_confirmed: false` is ignored, so an AI-proposed price only applies after the user confirms it.
- Exclusions are hard. A required excluded ingredient uses a curated substitution from `recipes.json` if one exists; otherwise the recipe is dropped. Optional excluded items are simply skipped.
- Optional ingredients are never bought. They are used only if already on hand.
- `pantry_after_cooking` is called only after the user confirms they cooked the meal. It only reduces rows with known quantities, and expects pantry rows in base units.
- `meal_scope` values other than `single_meal` return `invalid_request` with a "not implemented yet" reason. They are never faked.

## Data provenance (for DISCLOSURES.md)

Each ingredient uses its newest real price. Current mix (45 ingredients): 20 PSA September 2026, 4 DA March 2025, 5 DTI February 2025, 16 AI estimates.

PSA, September 2026 (20 ingredients, `official_reference`, observed_at 2026-09-17):

- Source: PSA "Price Situationer of Selected Agricultural Commodities, Second Phase of September 2026" (reference period 15-17 Sep 2026, released 30 Sep 2026), statistical tables, NCR row - https://psa.gov.ph/statistics/price-situationer/selected-agri-commodities/node/1684084237
- Covers: rice (regular milled), pork kasim, dressed chicken, medium eggs, tilapia, ampalaya, cabbage, carrot, eggplant, pechay (native), string beans, tomato, white potato, red onion, imported garlic, ginger (Hawaiian), calamansi, lakatan banana, carabao mango, brown sugar.
- The original workbook is kept at `data/sources/`. `data/price_updates/build_psa_update.py` reads it and writes `data/price_updates/2026-09-17_psa_ncr.csv`, which was imported with `ds_update_prices.py`. No figures were typed by hand.
- Parsing was checked: the workbook's national averages for 7 commodities match the figures published on the PSA release page exactly.
- Five vegetables (tomato, cabbage, pechay, ampalaya, string beans) rose more than 50% versus March 2025 and were accepted deliberately with `--allow-big-changes`.
- Not used: PSA "cooking oil" (no type or size given). The DA palm oil 350 ml price is kept because it matches what shoppers buy.

DA, 1 March 2025 (4 ingredients still active: kalabasa, sayote, saba banana, palm oil 350 ml):

- DA-AMAS "Retail Price of Selected Agri-fishery Commodities at NCR Markets" - https://da.gov.ph/wp-content/uploads/2025/03/Price-Monitoring-March-1-2025.pdf
- These items are not in the PSA tables. Plans warn that these prices are from 2025.

DTI, 1 February 2025 (5 ingredients: canned sardines 155 g, soy sauce 200 ml, vinegar 200 ml, patis 150 ml, iodized salt 250 g):

- DTI "Suggested Retail Prices of Basic Necessities and Prime Commodities" - https://esigaw.dti.gov.ph/wp-content/uploads/2025/02/BNPC-SRP-BULLETIN-01-FEBRUARY-2025.002.pdf

AI estimates (16 ingredients, `demo_seed`):

- Covers: ground pork, kangkong, malunggay, labanos, okra, patola, monggo, misua, tokwa, coconut milk, bagoong, sinigang mix, bay leaf, black pepper, long green chili, canned corned beef.
- These were generated by Claude (Anthropic). They were NOT observed at a market and are labeled DEMO in every plan. Any real price imported later automatically outranks them, whatever its date.

Older rows stay in `prices.json` as history; the engine picks the active one per ingredient.

Recipes and ingredients:

- 19 common Filipino dishes: 16 ulam (served with rice) and 3 fruit or merienda recipes (banana cue, ginataang saba, fresh mango and lakatan) for `meal_type` snack or breakfast. Quantities and steps were written with Claude for this project; no recipe text was copied (`rights_status: original_team_written`).
- No nutrition claims are made.

## Keeping prices current (weekly update)

No scraping: the DA site disallows automated retrieval, and the core app must work offline. A person downloads the newest DA price monitoring or DTI SRP bulletin, or records prices at a market, and imports them:

1. Copy `data/price_updates/TEMPLATE.csv` to `data/price_updates/YYYY-MM-DD.csv`.
2. Fill one row per item: `ingredient` (id or alias such as kamatis), `amount_php`, `quantity`, `unit`, `observed_at`, `source_type` (`official_reference` or `user_entered`), and `source_reference` (document title plus URL, or who observed it and where). `market_or_area` and `minimum_purchase_quantity` are optional.
3. Check the file: `python ds_ds_update_prices.py data/price_updates/YYYY-MM-DD.csv --dry-run`
4. Import it: `python ds_ds_update_prices.py data/price_updates/YYYY-MM-DD.csv`

What the importer guarantees:

- New rows are appended, never overwritten, so `prices.json` doubles as price history (useful for the P1 price chart).
- The engine always uses the newest dated price per ingredient, so nothing else changes.
- Rejected: future dates, unknown ingredients, wrong units (for example liters for fish), non-positive prices, missing sources, duplicates, and `demo_seed` rows. AI estimates can never be imported as data.
- A change of more than 50% against the current price is treated as a likely typo and skipped unless `--allow-big-changes` is given.
- The backend can call `import_price_rows(rows, store)` directly and insert the accepted rows into SQLite instead.
- `data/apply_official_prices.py` keeps imported rows if it is ever rerun.

## Run

```
cd backend
python -m unittest discover -s tests -v
python -m app.budget_engine.demo
```
