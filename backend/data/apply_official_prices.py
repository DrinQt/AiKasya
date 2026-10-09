"""Replace AI-estimated seed prices with official published figures where a source exists.

Run once from backend/:  python data/apply_official_prices.py
Idempotent. Every official row cites its document, date and the exact line item used.

Sources (retrieved 2026-10-10):
- DA-AMAS, "Retail Price of Selected Agri-fishery Commodities at NCR Markets", 1 March 2025
  (prevailing retail prices): https://da.gov.ph/wp-content/uploads/2025/03/Price-Monitoring-March-1-2025.pdf
- DTI, "Suggested Retail Prices (SRPs) of Basic Necessities and Prime Commodities", as of 1 February 2025:
  https://esigaw.dti.gov.ph/wp-content/uploads/2025/02/BNPC-SRP-BULLETIN-01-FEBRUARY-2025.002.pdf
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent
DA_URL = "https://da.gov.ph/wp-content/uploads/2025/03/Price-Monitoring-March-1-2025.pdf"
DTI_URL = "https://esigaw.dti.gov.ph/wp-content/uploads/2025/02/BNPC-SRP-BULLETIN-01-FEBRUARY-2025.002.pdf"
DA_DATE, DTI_DATE = "2025-03-01", "2025-02-01"
DA_AREA, DTI_AREA = "NCR markets (DA prevailing price)", "Philippines / NCR (DTI SRP)"

# ingredient_id: (amount_php, quantity, unit, minimum_purchase_quantity, line item in the source)
DA = {
    "rice": (40, 1, "kg", 0.25, "Rice, Local Regular Milled, PHP 40.00/kg"),
    "garlic": (160, 1, "kg", 0.05, "Imported Garlic, PHP 160.00/kg"),
    "onion": (180, 1, "kg", 0.1, "Red Onion (Pulang Sibuyas), PHP 180.00/kg"),
    "tomato": (50, 1, "kg", 0.1, "Tomato (Kamatis), PHP 50.00/kg"),
    "ginger": (200, 1, "kg", 0.05, "Ginger (Luya), PHP 200.00/kg"),
    "pork_kasim": (250, 1, "kg", 0.25, "Frozen Kasim, PHP 250.00/kg"),
    "chicken": (220, 1, "kg", 0.25, "Whole Chicken, PHP 220.00/kg"),
    "tilapia": (160, 1, "kg", 0.25, "Tilapia, PHP 160.00/kg"),
    "eggs": (8, 1, "piece", 1, "Chicken Eggs, White Medium, PHP 8.00/piece"),
    "pechay": (80, 1, "kg", 0.25, "Pechay Tagalog, PHP 80.00/kg"),
    "kalabasa": (60, 1, "kg", 0.25, "Squash (Kalabasa), PHP 60.00/kg"),
    "talong": (120, 1, "kg", 0.25, "Eggplant (Talong), PHP 120.00/kg"),
    "sitaw": (120, 1, "kg", 0.25, "String Beans (Sitao), PHP 120.00/kg"),
    "sayote": (50, 1, "kg", 0.25, "Chayote (Sayote), PHP 50.00/kg"),
    "ampalaya": (120, 1, "kg", 0.25, "Bittergourd (Ampalaya), PHP 120.00/kg"),
    "cabbage": (80, 1, "kg", 0.25, "Cabbage (Scorpio), PHP 80.00/kg"),
    "carrot": (100, 1, "kg", 0.25, "Carrot (Karot), PHP 100.00/kg"),
    "potato": (130, 1, "kg", 0.25, "White Potato (Patatas), PHP 130.00/kg"),
    "calamansi": (120, 1, "kg", 0.1, "Calamansi, PHP 120.00/kg"),
    "sugar": (70, 1, "kg", 0.25, "Sugar (Brown), PHP 70.00/kg"),
    "cooking_oil": (40, 350, "ml", 350, "Palm Oil (350 ml), PHP 40.00"),
    "saba": (50, 1, "kg", 0.25, "Banana (Saba), PHP 50.00/kg"),
    "lakatan": (120, 1, "kg", 0.25, "Banana (Lakatan), PHP 120.00/kg"),
    "mango": (200, 1, "kg", 0.25, "Mango (Carabao), PHP 200.00/kg"),
}
DTI = {
    "sardines_can": (17.25, 1, "piece", 1, "Saba Phil. Sardines - NCR 155g, PHP 17.25"),
    "soy_sauce": (11.50, 200, "ml", 200, "Silver Swan Soy Sauce Doy Pack - WMKT 200ml, PHP 11.50"),
    "vinegar": (8.50, 200, "ml", 200, "Silver Swan Sukang Puti Doy Pack - WMKT 200ml, PHP 8.50"),
    "fish_sauce": (11.50, 150, "ml", 150, "Lorins Patis Pouch 150ml, PHP 11.50"),
    "salt": (9.75, 250, "g", 250, "Lasap Iodized Salt 250g, PHP 9.75"),
}
AI_REF = ("AI-generated estimate (Claude, Anthropic) of a typical Metro Manila market price; no official source "
          "found for this item. NOT observed at a market. Verify with the vendor and update in Market Mode.")

ings = json.loads((DATA / "ingredients.json").read_text())
prices = json.loads((DATA / "prices.json").read_text())
recipes = json.loads((DATA / "recipes.json").read_text())

# 1) calamansi: DA prices it per kg, so switch the ingredient from pieces to grams (about 10 g per fruit)
for i in ings:
    if i["ingredient_id"] == "calamansi":
        i.update(base_unit="g", default_purchase_increment=100, count_label=None)
    if i["ingredient_id"] == "cooking_oil":
        i["default_purchase_increment"] = 350
for r in recipes:
    for line in r["ingredients"]:
        if line["ingredient_id"] == "calamansi" and line["unit"] == "piece":
            line.update(quantity=line["quantity"] * 10, unit="g", note="About 1 calamansi per 10 g")

# 2) rebuild prices: one official row where a source exists, otherwise one clearly labeled AI estimate
official = {**{k: (v, "DA", DA_DATE, DA_AREA, DA_URL, "DA-AMAS NCR Price Monitoring, 1 March 2025")
               for k, v in DA.items()},
            **{k: (v, "DTI", DTI_DATE, DTI_AREA, DTI_URL, "DTI SRP Bulletin, as of 1 February 2025")
               for k, v in DTI.items()}}
new_prices = []
for i in ings:
    iid = i["ingredient_id"]
    old = next(p for p in prices if p["ingredient_id"] == iid and not p.get("imported_via"))
    if iid in official:
        (amt, qty, unit, minq, item), agency, d, area, url, title = official[iid]
        new_prices.append({
            "price_id": f"{agency.lower()}-{d}-{iid}", "ingredient_id": iid, "amount_php": amt,
            "quantity": qty, "unit": unit, "minimum_purchase_quantity": minq, "market_or_area": area,
            "observed_at": d, "source_type": "official_reference",
            "source_reference": f"{title}: {item}. {url} (retrieved 2026-10-10)", "is_user_confirmed": False,
        })
    else:
        row = dict(old)
        row["source_reference"] = AI_REF
        row["market_or_area"] = "Metro Manila (AI estimate)"
        new_prices.append(row)

new_prices += [p for p in prices if p.get("imported_via")]   # keep weekly imports / history
(DATA / "ingredients.json").write_text(json.dumps(ings, indent=2) + "\n")
(DATA / "prices.json").write_text(json.dumps(new_prices, indent=2) + "\n")
(DATA / "recipes.json").write_text(json.dumps(recipes, indent=2) + "\n")
n_off = sum(p["source_type"] == "official_reference" for p in new_prices)
print(f"{n_off} official prices, {len(new_prices) - n_off} AI-estimate prices")
