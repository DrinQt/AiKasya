from typing import List
from fastapi import APIRouter
from app.models.schemas import PantryItem, PantryUpsertRequest
from app.database import get_all_pantry_db, upsert_pantry_db

router = APIRouter(prefix="/api/pantry", tags=["pantry"])


@router.get("", response_model=List[PantryItem])
async def list_pantry():
    pantry = get_all_pantry_db()
    return [PantryItem(**p) for p in pantry]


@router.post("/upsert", response_model=PantryItem)
async def upsert_pantry(req: PantryUpsertRequest):
    updated = upsert_pantry_db(
        ingredient_id=req.ingredient_id,
        quantity=req.quantity,
        unit=req.unit,
    )
    return PantryItem(**updated)
