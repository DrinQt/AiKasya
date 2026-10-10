from decimal import Decimal
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

AllowedIntent = Literal[
    "plan_meal",
    "buy_food",
    "update_price",
    "swap_ingredient",
    "view_recipe",
    "update_pantry",
    "adjust_budget",
    "unknown",
]

MealScope = Literal["single_meal", "day", "week", "month"]


class AgentInterpretRequest(BaseModel):
    message: str = Field(..., description="User natural language message in English, Filipino, or Taglish")
    session_id: str = Field(default="demo-session", description="Session identifier")
    existing_constraints: Dict[str, Any] = Field(default_factory=dict, description="Pre-existing constraints")


class AgentInterpretResponse(BaseModel):
    intent: AllowedIntent = Field(default="plan_meal")
    budget_php: Optional[float] = Field(default=None, description="Budget extracted in PHP")
    servings: Optional[int] = Field(default=None, description="Number of persons/servings")
    meal_scope: MealScope = Field(default="single_meal")
    meal_type: Optional[str] = Field(default=None, description="e.g. breakfast, lunch, dinner")
    pantry_mentions: List[str] = Field(default_factory=list, description="Ingredients already available at home")
    pantry_empty: bool = False
    excluded_ingredients: List[str] = Field(default_factory=list, description="Allergens or excluded items")
    max_prep_minutes: Optional[int] = Field(default=None, description="Maximum preparation time in minutes")
    missing_required_fields: List[str] = Field(default_factory=list, description="Missing fields for planning")
    clarification_question: Optional[str] = Field(default=None, description="Clarification question if ambiguous")
    confidence_note: str = Field(default="Request interpreted locally; verify pantry quantities.")


class PantryInputItem(BaseModel):
    ingredient_id: str
    quantity: float
    unit: str


class PlanGenerateRequest(BaseModel):
    budget_php: float = Field(..., gt=0, description="Available food budget in PHP")
    servings: int = Field(default=4, ge=1, description="Household size or servings")
    meal_scope: MealScope = Field(default="single_meal")
    meal_type: Optional[str] = Field(default="dinner")
    pantry: List[PantryInputItem] = Field(default_factory=list)
    excluded_ingredient_ids: List[str] = Field(default_factory=list)
    max_prep_minutes: Optional[int] = Field(default=None)
    basic_food: bool = False


class ItemToBuy(BaseModel):
    ingredient_id: str
    name: str
    quantity: float
    unit: str
    cost_php: float
    price_source_type: str = Field(default="demo_seed", description="official_reference, user_entered, or demo_seed")
    price_observed_at: str = Field(default="2026-10-09")


class PantryItemUsed(BaseModel):
    ingredient_id: str
    name: str
    quantity: float
    unit: str


class RecipeOption(BaseModel):
    recipe_id: str
    recipe_name: str
    servings: int
    prep_minutes: Optional[int] = 0
    cook_minutes: Optional[int] = 0
    estimated_total_php: float
    remaining_php: float
    items_to_buy: List[ItemToBuy] = Field(default_factory=list)
    pantry_items_used: List[PantryItemUsed] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


PlanStatus = Literal["feasible", "no_match", "needs_price_data", "invalid_request"]


class PlanGenerateResponse(BaseModel):
    status: PlanStatus
    budget_php: float
    options: List[RecipeOption] = Field(default_factory=list)
    reason_if_no_match: Optional[str] = None
    basic_food: bool = False


class PlanRepriceRequest(BaseModel):
    recipe_id: str
    budget_php: float
    servings: int
    pantry: List[PantryInputItem] = Field(default_factory=list)
    excluded_ingredient_ids: List[str] = Field(default_factory=list, description="Ingredient ids or allergy words")


class ExclusionResolveRequest(BaseModel):
    terms: List[str] = Field(default_factory=list, description="Allergy/exclusion words or ingredient ids, e.g. 'shrimp', 'isda', 'pork'")


PriceSourceType = Literal["official_reference", "user_entered", "demo_seed"]


class PriceUpsertRequest(BaseModel):
    ingredient_id: str
    amount_php: float = Field(..., gt=0)
    quantity: float = Field(default=1.0, gt=0)
    unit: str = Field(default="kg")
    market_or_area: str = Field(default="user selected")
    source_type: PriceSourceType = Field(default="user_entered")


class PriceResponse(BaseModel):
    price_id: str
    ingredient_id: str
    amount_php: float
    quantity: float
    unit: str
    normalized_price_per_base_unit: float
    base_unit: str
    market_or_area: str
    observed_at: str
    source_type: str
    is_user_confirmed: bool


class HealthResponse(BaseModel):
    status: str = "ok"
    local_model_ready: bool
    db_ready: bool
    active_model_label: str
    offline_capable: bool = True
    hardware_notes: Optional[str] = None


class IngredientItem(BaseModel):
    ingredient_id: str
    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    category: str
    base_unit: str
    default_purchase_increment: float
    current_price_php: Optional[float] = None
    price_unit: Optional[str] = None
    price_source_type: Optional[str] = None
    price_observed_at: Optional[str] = None


class RecipeIngredientItem(BaseModel):
    ingredient_id: str
    name: str
    quantity: float
    unit: str
    optional: bool = False
    substitutions: List[str] = Field(default_factory=list)


class RecipeSummary(BaseModel):
    recipe_id: str
    name: str
    category: str
    base_servings: int
    prep_minutes: int
    cook_minutes: int
    source_title: str
    source_url_or_note: str


class RecipeDetail(RecipeSummary):
    steps: List[str]
    ingredients: List[RecipeIngredientItem]


class PantryItem(BaseModel):
    ingredient_id: str
    name: str
    quantity: float
    unit: str
    updated_at: str


class PantryUpsertRequest(BaseModel):
    ingredient_id: str
    quantity: float = Field(..., ge=0)
    unit: str
