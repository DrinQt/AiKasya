"""Price update importer: keeps AIKasya's local prices current without scraping.

Workflow (e.g. every week, when someone has internet):
  1. Copy data/price_updates/TEMPLATE.csv to data/price_updates/YYYY-MM-DD.csv
  2. Fill rows from the latest DA price monitoring / DTI SRP bulletin (downloaded by a person),
     or from prices the team observed at a market.
  3. From backend/:  python -m app.budget_engine.price_import data/price_updates/YYYY-MM-DD.csv
     (add --dry-run to only check the file)
Valid rows are APPENDED to data/prices.json. Old rows stay as price history; the engine always
uses the newest dated price per ingredient, so no other code changes are needed.

The backend can also call import_price_rows(...) directly and insert the returned rows into SQLite.

CSV columns:
  ingredient        ingredient_id or alias (e.g. "tilapia", "kamatis", "bawang")      required
  amount_php        price in pesos                                                      required
  quantity, unit    what the price is for, e.g. 1 kg / 200 ml / 1 piece                 required
  observed_at       date of the source, YYYY-MM-DD (not in the future)                  required
  source_type       official_reference | user_entered                                   required
  source_reference  document title + URL, or who observed it and where                  required
  market_or_area    e.g. "NCR markets (DA prevailing price)"                            optional
  minimum_purchase_quantity  smallest amount sold, in the same unit                     optional
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from .data_store import DEFAULT_DATA_DIR, DataStore
from .units import UnitError, to_base, to_decimal

REQUIRED = ("ingredient", "amount_php", "quantity", "unit", "observed_at", "source_type", "source_reference")
ALLOWED_SOURCES = ("official_reference", "user_entered")   # demo_seed / AI estimates cannot be imported
BIG_CHANGE = Decimal("0.5")   # flag changes of more than 50% vs the current price (likely typos)


def _unit_price(store: DataStore, row: dict) -> Decimal:
    base_unit = store.ingredients[row["ingredient_id"]]["base_unit"]
    return to_decimal(row["amount_php"]) / to_base(row["quantity"], row["unit"], base_unit)


def import_price_rows(raw_rows: list, store: DataStore, today: date | None = None,
                      allow_big_changes: bool = False) -> dict:
    """Validate raw CSV dict rows. Returns {"accepted": [...], "rejected": [...], "flagged": [...]}.

    Pure function: does not write files or modify the store.
    """
    today = today or date.today()
    accepted, rejected, flagged = [], [], []
    existing = {(p["ingredient_id"], str(p.get("observed_at"))[:10], p.get("source_type"),
                 str(to_decimal(p["amount_php"])), str(to_decimal(p["quantity"])), p.get("unit"))
                for p in store.prices}

    for n, raw in enumerate(raw_rows, start=2):   # line 1 is the header
        row = {k.strip(): (v or "").strip() for k, v in raw.items() if k}
        if not any(row.values()):
            continue
        tag = f"line {n} ({row.get('ingredient') or '?'})"
        missing = [c for c in REQUIRED if not row.get(c)]
        if missing:
            rejected.append(f"{tag}: missing {', '.join(missing)}")
            continue
        if row["source_type"] not in ALLOWED_SOURCES:
            rejected.append(f"{tag}: source_type must be official_reference or user_entered")
            continue
        try:
            observed = date.fromisoformat(row["observed_at"][:10])
        except ValueError:
            rejected.append(f"{tag}: observed_at must be YYYY-MM-DD")
            continue
        if observed > today:
            rejected.append(f"{tag}: observed_at {observed} is in the future")
            continue
        try:
            minq = to_decimal(row["minimum_purchase_quantity"]) if row.get("minimum_purchase_quantity") else None
            rec = store.build_price_record(
                row["ingredient"], row["amount_php"], row["quantity"], row["unit"],
                market_or_area=row.get("market_or_area") or "not specified",
                source_type=row["source_type"], observed_at=observed.isoformat(),
                minimum_purchase_quantity=float(minq) if minq is not None else None,
                source_reference=row["source_reference"], is_user_confirmed=True,
                price_id=f"import-{row['source_type']}-{observed.isoformat()}-{n}-"
                         f"{store.resolve_ingredient_id(row['ingredient']) or 'x'}")
        except (UnitError, ValueError) as e:
            rejected.append(f"{tag}: {e}")
            continue
        key = (rec["ingredient_id"], rec["observed_at"], rec["source_type"], str(to_decimal(rec["amount_php"])),
               str(to_decimal(rec["quantity"])), rec["unit"])
        if key in existing:
            rejected.append(f"{tag}: duplicate of a price already stored")
            continue
        rec["imported_via"] = "price_import"

        current = store.active_price(rec["ingredient_id"])
        if current is not None:
            old, new = _unit_price(store, current), _unit_price(store, rec)
            change = (new - old) / old
            if abs(change) > BIG_CHANGE:
                msg = (f"{tag}: {rec['ingredient_id']} changes {change * 100:+.0f}% vs current price "
                       f"({current.get('price_id')}); check for a typo or unit mix-up")
                flagged.append(msg)
                if not allow_big_changes:
                    rejected.append(msg + " [skipped; rerun with --allow-big-changes if correct]")
                    continue
        existing.add(key)
        accepted.append(rec)
    return {"accepted": accepted, "rejected": rejected, "flagged": flagged}


def import_csv_file(csv_path, data_dir=None, dry_run=False, allow_big_changes=False, today=None) -> dict:
    data_dir = Path(data_dir) if data_dir else DEFAULT_DATA_DIR
    store = DataStore.from_json_dir(data_dir)
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        result = import_price_rows(list(csv.DictReader(f)), store, today=today, allow_big_changes=allow_big_changes)
    if result["accepted"] and not dry_run:
        prices_path = data_dir / "prices.json"
        prices = json.loads(prices_path.read_text(encoding="utf-8"))
        prices.extend(result["accepted"])
        prices_path.write_text(json.dumps(prices, indent=2) + "\n", encoding="utf-8")
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description="Import a CSV of new prices into data/prices.json")
    ap.add_argument("csv_path")
    ap.add_argument("--data-dir", default=None)
    ap.add_argument("--dry-run", action="store_true", help="validate only; do not write prices.json")
    ap.add_argument("--allow-big-changes", action="store_true", help="accept changes of more than 50%%")
    a = ap.parse_args(argv)
    r = import_csv_file(a.csv_path, a.data_dir, a.dry_run, a.allow_big_changes)
    verb = "would be added" if a.dry_run else "added"
    print(f"{len(r['accepted'])} price row(s) {verb}")
    for row in r["accepted"]:
        print(f"  + {row['ingredient_id']}: PHP {row['amount_php']:.2f} per {row['quantity']:g} {row['unit']} "
              f"({row['source_type']}, {row['observed_at']})")
    for msg in r["rejected"]:
        print(f"  x {msg}")
    return 0 if not r["rejected"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
