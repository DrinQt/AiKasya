"""Weekly price update. Usage (from backend/):
    python ds_ds_update_prices.py data/price_updates/2026-10-17.csv            # import
    python ds_ds_update_prices.py data/price_updates/2026-10-17.csv --dry-run  # check only
See app/budget_engine/price_import.py for the CSV columns.
"""
from app.budget_engine.price_import import main

if __name__ == "__main__":
    raise SystemExit(main())
