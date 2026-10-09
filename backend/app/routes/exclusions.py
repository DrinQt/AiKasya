from fastapi import APIRouter
from app.models.schemas import ExclusionResolveRequest
from app.allergy import resolve_exclusions

router = APIRouter(prefix="/api/exclusions", tags=["exclusions"])


@router.post("/resolve")
async def resolve(req: ExclusionResolveRequest):
    """Allergy/exclusion words -> ingredient ids to exclude, with what was matched.

    Example: {"terms": ["shrimp", "isda"]} ->
      excluded_ingredient_ids: ["bagoong", "fish_sauce", "sardines_can", "tilapia"],
      resolved: [{term, allergen_groups, ingredient_ids, ingredients}], unknown: [], disclaimer
    Show `resolved` to the user and ask about anything in `unknown`.
    """
    return resolve_exclusions(req.terms)
