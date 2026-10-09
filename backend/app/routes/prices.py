from fastapi import APIRouter
from app.models.schemas import PriceUpsertRequest, PriceResponse
from app.database import upsert_price_db

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.post("/upsert", response_model=PriceResponse)
async def upsert_price(req: PriceUpsertRequest):
    updated = upsert_price_db(
        ingredient_id=req.ingredient_id,
        amount_php=req.amount_php,
        quantity=req.quantity,
        unit=req.unit,
        market_or_area=req.market_or_area,
        source_type=req.source_type,
    )
    return PriceResponse(**updated)
