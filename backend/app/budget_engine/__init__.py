"""AIKasya Data Science module: deterministic budget-to-meal planning.

Backend usage:
    from app.budget_engine import DataStore, generate_plan, reprice_plan
    store = DataStore.from_records(ingredient_rows, price_rows, recipe_rows)   # or DataStore.from_json_dir()
    response = generate_plan(request_body_dict, store)
"""
from .data_store import DataStore, DEFAULT_DATA_DIR, SOURCE_TYPES
from .engine import (
    ALGORITHM_NOTE,
    evaluate_recipe,
    generate_plan,
    option_to_plan_record,
    pantry_after_cooking,
    parse_request,
    reprice_plan,
)
from .price_import import import_csv_file, import_price_rows
from .units import UnitError, to_base

__all__ = [
    "DataStore", "DEFAULT_DATA_DIR", "SOURCE_TYPES", "ALGORITHM_NOTE", "UnitError", "to_base",
    "generate_plan", "reprice_plan", "evaluate_recipe", "pantry_after_cooking",
    "option_to_plan_record", "parse_request", "import_price_rows", "import_csv_file",
]
