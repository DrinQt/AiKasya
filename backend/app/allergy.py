"""Allergy / exclusion resolution for the backend (Data Science module).

Turns user words ("shrimp", "hipon", "allergic sa isda", "pork") or ingredient ids into the ingredient ids
that must be excluded, using the cited allergen data in data/allergens.json and data/ingredients.json.

Safety rules:
  - Unknown words are never ignored: callers must ask the user to clarify.
  - When unsure, an ingredient is treated as containing the allergen (see allergen_evidence per ingredient).
  - Packaged items whose recipes vary by brand get a "check the label" warning.
AIKasya is not a medical device; users with severe allergies must always read product labels.
"""
from functools import lru_cache
from typing import Dict, Iterable, List

from app.budget_engine import DataStore

DISCLAIMER = ("Allergy filtering uses the main allergen groups of the Philippine FDA labeling rule (AO 2014-0030) "
              "and Codex. It cannot detect cross-contamination or brand differences - always read product labels.")


@lru_cache(maxsize=1)
def _store() -> DataStore:
    return DataStore.from_json_dir()


def resolve_exclusions(terms: Iterable[str]) -> Dict:
    result = _store().resolve_exclusions(list(terms or []))
    result["disclaimer"] = DISCLAIMER
    return result


def label_check_warnings(ingredient_ids: Iterable[str], exclusions_active: bool) -> List[str]:
    """Warnings for packaged items in a plan when the user has allergies/exclusions."""
    if not exclusions_active:
        return []
    store = _store()
    out = []
    for iid in sorted(set(ingredient_ids)):
        ing = store.ingredients.get(iid)
        if ing and ing.get("allergen_label_check"):
            out.append(f"Allergy check: read the label of {ing['canonical_name']} - ingredients vary by brand.")
    return out
