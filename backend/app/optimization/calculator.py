import math
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Tuple, Optional

UNIT_CONVERSIONS: Dict[str, Tuple[str, float]] = {
    "g": ("g", 1.0),
    "gram": ("g", 1.0),
    "grams": ("g", 1.0),
    "kg": ("g", 1000.0),
    "kilo": ("g", 1000.0),
    "kilos": ("g", 1000.0),
    "ml": ("ml", 1.0),
    "milliliter": ("ml", 1.0),
    "l": ("ml", 1000.0),
    "liter": ("ml", 1000.0),
    "liters": ("ml", 1000.0),
    "tbsp": ("ml", 15.0),
    "tsp": ("ml", 5.0),
    "cup": ("ml", 240.0),
    "piece": ("piece", 1.0),
    "pc": ("piece", 1.0),
    "pcs": ("piece", 1.0),
    "clove": ("piece", 1.0),
    "cloves": ("piece", 1.0),
    "pack": ("piece", 1.0),
    "pouch": ("piece", 1.0),
    "bundle": ("bundle", 1.0),
    "tali": ("bundle", 1.0),
}


def normalize_unit_and_quantity(qty: float, unit: str) -> Tuple[float, str]:
    cleaned_unit = unit.strip().lower()
    if cleaned_unit in UNIT_CONVERSIONS:
        base_unit, factor = UNIT_CONVERSIONS[cleaned_unit]
        return qty * factor, base_unit
    return qty, cleaned_unit


def round_to_increment(value: float, increment: float) -> float:
    if increment <= 0 or value <= 0:
        return value
    return math.ceil(value / increment) * increment


def calculate_ingredient_shortfall(
    required_qty: float,
    required_unit: str,
    pantry_available_qty: float,
    pantry_unit: str,
    purchase_increment: float = 0.0,
) -> Tuple[float, float, str]:
    req_base_qty, req_base_unit = normalize_unit_and_quantity(required_qty, required_unit)
    pantry_base_qty, pantry_base_unit = normalize_unit_and_quantity(pantry_available_qty, pantry_unit)

    if req_base_unit != pantry_base_unit:
        pantry_used_base = 0.0
    else:
        pantry_used_base = min(req_base_qty, pantry_base_qty)

    shortfall = max(0.0, req_base_qty - pantry_used_base)

    if shortfall > 0 and purchase_increment > 0:
        to_purchase = round_to_increment(shortfall, purchase_increment)
    else:
        to_purchase = shortfall

    return to_purchase, pantry_used_base, req_base_unit


def decimal_round(val: float, places: int = 2) -> float:
    d = Decimal(str(val))
    target = Decimal("10") ** -places
    return float(d.quantize(target, rounding=ROUND_HALF_UP))
