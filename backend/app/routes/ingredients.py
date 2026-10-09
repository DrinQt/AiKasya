from typing import List
from fastapi import APIRouter
from app.models.schemas import IngredientItem
from app.database import get_all_ingredients_db

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])


@router.get("", response_model=List[IngredientItem])
async def list_ingredients():
    ingredients = get_all_ingredients_db()
    return [IngredientItem(**i) for i in ingredients]
