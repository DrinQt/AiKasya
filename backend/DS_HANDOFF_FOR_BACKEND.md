# AIKasya - Data Science Handoff to Backend

From: James Kalaw (Data Science lead)
To: Backend lead
Branch: `data-science` (based on `main` at 352feac)
Date: 2026-10-10, ~03:20 PHT

Give this file to your AI coding assistant together with `AIKasya_MASTER_HANDOFF.md`.

---

## 1. Summary

The backend's simulation/test seed data has been REPLACED with the Data Science dataset:

- 45 ingredients, 19 Filipino recipes (16 ulam + 3 merienda/fruit) and real, cited prices.
- `data/seed_data.py` no longer hard-codes data. It builds `INGREDIENTS_SEED`, `PRICES_SEED` and `RECIPES_SEED` from `data/ingredients.json`, `data/recipes.json` and `data/prices.json` (single source of truth, maintained by Data Science).
- Your FastAPI routes, schemas, engine design, Local AI code and the frontend contract are unchanged except for the small fixes in Section 3.

Why the old data was removed: it was simulation data, and 9 prices were labeled `official_reference` with the source "DA Bantay Presyo Oct 2026 Reference". No such document was used, and the numbers did not match real government figures (for example tomato PHP 70/kg vs PSA PHP 125.88/kg). The old `aikasya.db` also contained 9 leftover tilapia test prices (PHP 195/240, `user_entered`), so the demo's "current" tilapia price was test data.

---

## 2. The data now in the app

Prices (one active price per ingredient is seeded, using the same rule as the Data Science engine):

- 20 from PSA, "Price Situationer of Selected Agricultural Commodities, Second Phase of September 2026", NCR averages, observed_at 2026-09-17: rice (regular milled) 46.69/kg, pork kasim 336.37/kg, chicken (dressed) 199.26/kg, eggs (medium) 8.54/piece, tilapia 162.15/kg, tomato 125.88/kg, red onion 123.78/kg, garlic (imported) 155.91/kg, ginger 185.34/kg, cabbage, carrot, potato, eggplant, pechay, string beans, ampalaya, calamansi, lakatan, carabao mango, brown sugar.
- 4 from DA NCR price monitoring, 1 Mar 2025: kalabasa, sayote, saba, palm oil 350 ml (PHP 40.00).
- 5 from the DTI SRP bulletin, 1 Feb 2025: canned sardines 155 g, soy sauce 200 ml, vinegar 200 ml, patis 150 ml, iodized salt 250 g.
- 16 `demo_seed` estimates, clearly labeled as AI-generated, not observed: kangkong, monggo, tokwa, ground pork, malunggay, misua, coconut milk, bagoong, sinigang mix, bay leaf, black pepper, long green chili, labanos, okra, patola, corned beef.

Every official row's `source_reference` names the exact document line item and URL. The original PSA workbook is in `data/sources/`.

Ingredient ids changed. The frontend resolves ingredients by id, name and alias through `/api/ingredients`, so it keeps working. Main ids: `rice`, `garlic`, `onion`, `tomato`, `eggs`, `chicken`, `pork_kasim`, `pork_giniling`, `tilapia`, `kangkong`, `soy_sauce`, `vinegar`, `fish_sauce`, `cooking_oil`, `salt`, `black_pepper`, `sugar`. Tagalog names (kanin, bawang, sibuyas, kamatis, itlog, toyo, suka, patis, mantika, asin) are aliases.

Recipe ids are slugs: `ginisang-monggo`, `tortang-talong`, `adobong-kangkong`, `sardinas-misua`, `ginisang-sayote`, `pritong-tilapia`, `sinigang-na-baboy`, `adobong-manok`, `tinolang-manok`, `corned-beef-guisado`, `arroz-caldo`, `ginataang-kalabasa-sitaw`, `ginisang-pechay-tokwa`, `itlog-kamatis`, `sinangag-at-itlog`, `pinakbet`, `banana-cue`, `ginataang-saba`, `prutas-mangga-saging`.

Each ulam recipe includes uncooked rice as a side (100 g per serving), so pantry rice offsets the cost.

---

## 3. Code changes in the backend (please review)

`app/database.py`:

1. Seed rows keep their real `observed_at` date (they were all stamped 2026-10-09).
2. New `meal_types` column on `recipes` (JSON list). It has an automatic `ALTER TABLE` migration for older local databases. Seeded from the dataset and returned by `get_all_recipes_db` and `get_recipe_by_id_db`.
3. Bug fix: `upsert_price_db` now stores the ingredient's purchase step (`default_purchase_increment`) as `minimum_purchase_quantity`. It previously stored 0, so after any Market Mode price update the app priced exact grams (for example 800 g of tilapia) instead of what a vendor sells (1 kg in 250 g steps). The existing contract test caught this once realistic pack sizes were in the data.

`app/optimization/engine.py`:

4. A `meal_type` filter. Recipes whose `meal_types` do not include the requested meal are skipped, and "merienda"/"meryenda" map to `snack`. This stops Banana Cue from being suggested for dinner.
5. Optional ingredients are used only if they are already in the pantry; they are never bought. A warning lists what was left out (for example the optional ground pork in Ginisang Monggo).

`data/seed_data.py`: rewritten to load the Data Science JSON dataset (see Section 1).

`data/aikasya.db`: rebuilt from the new seed. It contains no test prices and no pantry rows.

Tests (same checks, new ids):

- `tests/test_offline_flow.py`: pantry `bawang` -> `garlic`.
- `tests/test_frontend_contract.py`: `egg` -> `eggs`.
- `tests/qa_matrix.py`: pantry `bawang` -> `garlic`. QA-9 uses `pritong-tilapia`; the recipe needs 800 g for 4 people, tilapia is sold in 250 g steps, so 1 kg at PHP 195/kg = PHP 195.00.

---

## 4. Test results on this branch

- `python -m pytest -q tests/test_offline_flow.py tests/test_frontend_contract.py tests/test_budget_engine.py` -> 57 passed.
- `tests/qa_matrix.py` against a live server -> 10/10. The "local model ready" check and QA-3's servings check were skipped because the test machine had no Ollama; see below.
- `python ds_check.py` -> 13/13.
- Journey A via your API (PHP 200, 4 people, pantry rice 1 kg + garlic 100 g, dinner): Sardinas with Misua PHP 101.88, Adobong Kangkong PHP 108.00, Ginisang Monggo PHP 106.47. All are within budget and the item sums equal the totals.
- Merienda via your API (PHP 150, 4 people, `meal_type: "snack"`): Banana Cue PHP 110.77, Ginataang Saba PHP 118.27.

Pre-existing issue (also fails on `main`, not caused by this branch): without Ollama, the fallback parser reads "Dalawang daan lang budget para sa 3 tao tanghalian, walang baboy" as servings=2 instead of 3.

For the Local AI lead:

- Add "merienda"/"meryenda"/"snack" detection to `meal_type` in `app/local_ai/parser.py`; otherwise the 3 fruit/merienda recipes are only reachable when the frontend sends `snack`.
- The frontend currently defaults `meal_type` to "dinner".

---

## 5. Rules for the team

- After running `tests/qa_matrix.py` against a live server, do NOT commit `data/aikasya.db`, because QA-9 writes a test price into it. Rebuild it first:

```
cd backend
Remove-Item data\aikasya.db
python -c "from app.database import init_db; init_db()"
```

- Teammates with an old local `aikasya.db`: delete it and rebuild with the same commands (old databases keep the old seed because seeding only runs on an empty database).
- Never label a price `official_reference` unless `source_reference` cites a real document.

---

## 6. Keeping prices current

- Live, offline: `POST /api/prices/upsert` (Market Mode). The newest `observed_at` wins.
- New official release: `python ds_update_prices.py data/price_updates/<file>.csv` (template: `data/price_updates/TEMPLATE.csv`; PSA workbook converter: `data/price_updates/build_psa_update.py`), then rebuild `aikasya.db` (Section 5).

---

## 7. Optional: the full Data Science engine (`app/budget_engine/`)

This package is included but not wired in. It runs on the same dataset and adds:

- alias resolution and exclusion tags (`pork`, `seafood`, `egg`)
- an honest `needs_price_data` status
- pantry items without quantities ("may kanin kami") handled with a "please verify" warning
- `pack_note` ("2 bundles", "1 pack of 350 ml")
- Market Mode `already_purchased`
- `suggested_changes` on `no_match`
- reprice alternatives

Docs: `app/budget_engine/README.md`. Checks: `python ds_check.py`, `python ds_try.py`, `tests/test_budget_engine.py`. Consider it after the demo.

---

## 8. For DISCLOSURES.md ("Existing code and assets")

- Official prices (29 ingredients):
  - PSA "Price Situationer of Selected Agricultural Commodities, Second Phase of September 2026" (NCR averages, reference period 15-17 Sep 2026) - https://psa.gov.ph/statistics/price-situationer/selected-agri-commodities/node/1684084237
  - DA-AMAS "Retail Price of Selected Agri-fishery Commodities at NCR Markets", 1 Mar 2025 - https://da.gov.ph/wp-content/uploads/2025/03/Price-Monitoring-March-1-2025.pdf
  - DTI SRP bulletin, 1 Feb 2025 - https://esigaw.dti.gov.ph/wp-content/uploads/2025/02/BNPC-SRP-BULLETIN-01-FEBRUARY-2025.002.pdf
- 16 prices are AI-generated estimates (Claude), labeled `demo_seed` in the app and not observed at a market.
- Recipes: 19 common Filipino dishes; quantities and steps written with Claude for this project; no recipe text copied.
- Do NOT write "DA Bantay Presyo October 2026" anywhere: no such source was used.
- AI development tools used by the Data Science lead: Claude (Anthropic), for data sourcing and verification, code, tests and documentation.

Questions: ask James before changing prices, recipes or the cited sources.
