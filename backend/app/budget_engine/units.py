"""Unit normalization for AIKasya.

Every ingredient has one base unit: "g" (mass), "ml" (volume) or "piece" (count).
All quantities are converted to that base unit before any arithmetic.
Mass <-> volume and mass/volume <-> count conversions are NOT guessed; they raise UnitError.
"""
from decimal import Decimal

# unit alias -> (dimension, factor to base unit)
_UNITS = {
    # mass -> g
    "g": ("mass", Decimal("1")), "gram": ("mass", Decimal("1")), "grams": ("mass", Decimal("1")),
    "kg": ("mass", Decimal("1000")), "kilo": ("mass", Decimal("1000")), "kilos": ("mass", Decimal("1000")),
    "kilogram": ("mass", Decimal("1000")), "kilograms": ("mass", Decimal("1000")),
    # volume -> ml
    "ml": ("volume", Decimal("1")), "milliliter": ("volume", Decimal("1")), "milliliters": ("volume", Decimal("1")),
    "l": ("volume", Decimal("1000")), "liter": ("volume", Decimal("1000")), "liters": ("volume", Decimal("1000")),
    "litre": ("volume", Decimal("1000")), "litres": ("volume", Decimal("1000")),
    "tsp": ("volume", Decimal("5")), "tbsp": ("volume", Decimal("15")), "cup": ("volume", Decimal("240")),
    "cups": ("volume", Decimal("240")),
    # count -> piece (what one "piece" means is defined per ingredient via count_label)
    "piece": ("count", Decimal("1")), "pieces": ("count", Decimal("1")), "pc": ("count", Decimal("1")),
    "pcs": ("count", Decimal("1")), "bundle": ("count", Decimal("1")), "bundles": ("count", Decimal("1")),
    "tali": ("count", Decimal("1")), "can": ("count", Decimal("1")), "cans": ("count", Decimal("1")),
    "sachet": ("count", Decimal("1")), "sachets": ("count", Decimal("1")), "pack": ("count", Decimal("1")),
    "packs": ("count", Decimal("1")), "block": ("count", Decimal("1")), "blocks": ("count", Decimal("1")),
    "item": ("count", Decimal("1")), "items": ("count", Decimal("1")),
}
_BASE_DIMENSION = {"g": "mass", "ml": "volume", "piece": "count"}


class UnitError(ValueError):
    """Raised when a unit is unknown or incompatible with an ingredient's base unit."""


def to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        raise ValueError("quantity is required")
    if isinstance(value, float):
        return Decimal(repr(value))
    return Decimal(str(value))


def normalize_unit(unit: str) -> str:
    u = (unit or "").strip().lower()
    if u not in _UNITS:
        raise UnitError(f"Unknown unit '{unit}'. Allowed: g, kg, ml, L, tsp, tbsp, cup, piece/bundle/can/sachet/pack.")
    return u


def is_known_unit(unit: str) -> bool:
    return (unit or "").strip().lower() in _UNITS


def to_base(quantity, unit: str, base_unit: str) -> Decimal:
    """Convert quantity in `unit` to the ingredient's `base_unit` (g, ml or piece)."""
    if base_unit not in _BASE_DIMENSION:
        raise UnitError(f"Invalid ingredient base_unit '{base_unit}' (must be g, ml or piece)")
    dim, factor = _UNITS[normalize_unit(unit)]
    if dim != _BASE_DIMENSION[base_unit]:
        raise UnitError(f"Cannot convert '{unit}' ({dim}) to '{base_unit}' ({_BASE_DIMENSION[base_unit]}) "
                        "without a density/weight-per-piece table")
    return to_decimal(quantity) * factor


def from_base(quantity_base: Decimal, unit: str, base_unit: str) -> Decimal:
    """Inverse of to_base."""
    return to_decimal(quantity_base) / to_base(1, unit, base_unit)
