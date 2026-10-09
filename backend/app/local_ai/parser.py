import json
import re
from typing import Optional, Dict, Any, List
from app.models.schemas import AgentInterpretResponse, AllowedIntent


def clean_json_string(raw: str) -> str:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if match:
        return match.group(1).strip()
    return raw


PANTRY_NORMALIZATION_MAP = {
    "kanin": "rice",
    "bigas": "rice",
    "rice": "rice",
    "bawang": "garlic",
    "garlic": "garlic",
    "sibuyas": "onion",
    "onion": "onion",
    "onions": "onion",
    "toyo": "soy sauce",
    "soy sauce": "soy sauce",
    "suka": "vinegar",
    "vinegar": "vinegar",
    "mantika": "cooking oil",
    "oil": "cooking oil",
    "cooking oil": "cooking oil",
    "patis": "fish sauce",
    "fish sauce": "fish sauce",
    "asin": "salt",
    "salt": "salt",
    "paminta": "pepper",
    "pepper": "pepper",
    "asukal": "sugar",
    "sugar": "sugar",
    "itlog": "egg",
    "egg": "egg",
    "eggs": "egg",
}


def normalize_pantry_item(item: str) -> str:
    cleaned = item.lower().strip()
    return PANTRY_NORMALIZATION_MAP.get(cleaned, cleaned)


def parse_and_validate_llm_json(raw_text: str) -> Optional[AgentInterpretResponse]:
    try:
        cleaned = clean_json_string(raw_text)
        data = json.loads(cleaned)
        if isinstance(data, dict):
            mt = str(data.get("meal_type") or "").lower()
            if mt in ["merienda", "meryenda", "miryenda", "snack"]:
                data["meal_type"] = "snack"
            elif mt in ["any", "all", "none"]:
                data["meal_type"] = None
            if "pantry_mentions" in data and isinstance(data["pantry_mentions"], list):
                norm_pantry = []
                for p in data["pantry_mentions"]:
                    norm = normalize_pantry_item(str(p))
                    if norm not in norm_pantry:
                        norm_pantry.append(norm)
                data["pantry_mentions"] = norm_pantry
        return AgentInterpretResponse(**data)
    except Exception:
        return None


def rule_assisted_taglish_fallback(message: str, existing_constraints: Optional[Dict[str, Any]] = None) -> AgentInterpretResponse:
    msg = message.lower()
    constraints = existing_constraints or {}

    intent: AllowedIntent = "plan_meal"
    if any(k in msg for k in ["presyo", "price", "magkano", "per kilo", "kada kilo"]):
        intent = "update_price"
    elif any(k in msg for k in ["palitan", "swap", "substitute", "iba naman"]):
        intent = "swap_ingredient"
    elif any(k in msg for k in ["recipe", "paano lutuin", "steps", "how to cook"]):
        intent = "view_recipe"
    elif any(k in msg for k in ["pantry", "kusina", "meron kami", "dagdag sa kusina"]):
        intent = "update_pantry"
    elif any(k in msg for k in ["bawas budget", "dagdag budget", "adjust"]):
        intent = "adjust_budget"

    budget_php: Optional[float] = None
    tagalog_budget_words = {
        "isang daan": 100.0,
        "isang daang": 100.0,
        "dalawang daan": 200.0,
        "dalawang daang": 200.0,
        "tatlong daan": 300.0,
        "tatlong daang": 300.0,
        "apat na raan": 400.0,
        "apat na daan": 400.0,
        "limang daan": 500.0,
        "limang daang": 500.0,
        "isang libo": 1000.0,
    }
    for phrase, val in tagalog_budget_words.items():
        if phrase in msg:
            budget_php = val
            break

    if budget_php is None:
        budget_patterns = [
            r"[₱p]?\s*(\d+(?:\.\d+)?)\s*(?:pesos|peso|php|budget|lang|para sa)",
            r"(?:budget(?:\s*ng)?|may|meron(?:g)?)\s*[₱p]?\s*(\d+(?:\.\d+)?)",
            r"[₱](\d+(?:\.\d+)?)",
        ]
        for pattern in budget_patterns:
            match = re.search(pattern, msg)
            if match:
                try:
                    budget_php = float(match.group(1))
                    break
                except ValueError:
                    pass

    if budget_php is None:
        budget_php = constraints.get("budget_php")

    servings: int = constraints.get("servings") or 4
    found_digit = False
    servings_patterns = [
        r"(?:ng|para sa|good for|for)\s*(\d+)\s*(?:tao|person|persons|people|pax)?",
        r"(\d+)\s*(?:katao|pax|people|tao|person|persons)",
    ]
    for pattern in servings_patterns:
        m = re.search(pattern, msg)
        if m and m.group(1):
            try:
                servings = int(m.group(1))
                found_digit = True
                break
            except ValueError:
                pass

    if not found_digit:
        word_to_num = {
            "dalawa": 2, "tatlo": 3, "apat": 4, "lima": 5, "anim": 6,
            "pito": 7, "walo": 8, "siyam": 9, "sampu": 10,
        }
        for w, val in word_to_num.items():
            # Match word boundary and ignore if it is part of 'daan'
            if re.search(rf"\b{w}\b(?!\s*ng\s+daan)(?!ng\s+daan)", msg):
                servings = val
                break

    meal_type = "dinner"
    if any(k in msg for k in ["almusal", "breakfast", "agahan"]):
        meal_type = "breakfast"
    elif any(k in msg for k in ["tanghalian", "lunch"]):
        meal_type = "lunch"
    elif any(k in msg for k in ["merienda", "meryenda", "snack", "miryenda"]):
        meal_type = "snack"
    elif any(k in msg for k in ["hapunan", "dinner"]):
        meal_type = "dinner"

    pantry_keywords = {
        "rice": ["kanin", "bigas", "rice"],
        "garlic": ["bawang", "garlic"],
        "onion": ["sibuyas", "onion", "onions"],
        "soy sauce": ["toyo", "soy sauce"],
        "vinegar": ["suka", "vinegar"],
        "cooking oil": ["mantika", "oil", "cooking oil"],
        "fish sauce": ["patis", "fish sauce"],
        "salt": ["asin", "salt"],
        "pepper": ["paminta", "pepper"],
        "egg": ["itlog", "egg", "eggs"],
    }
    pantry_mentions: List[str] = []
    pantry_context = re.search(r"(?:may|meron|have|already have|stock)\s+([^.]+)", msg)
    search_text = pantry_context.group(1) if pantry_context else msg
    for standard_name, aliases in pantry_keywords.items():
        if any(a in search_text for a in aliases):
            pantry_mentions.append(standard_name)

    excluded: List[str] = []
    exclusion_patterns = [
        r"(?:walang|ayaw ng|ayaw namin ng|bawal|no|without)\s+([a-zA-Z\s]+?)(?:,|at|and|\.|$)",
    ]
    for pattern in exclusion_patterns:
        m = re.search(pattern, msg)
        if m:
            ex_item = m.group(1).strip()
            if ex_item and ex_item not in ["kanin", "bawang"]:
                excluded.append(ex_item)

    missing: List[str] = []
    clarification: Optional[str] = None
    if budget_php is None and intent == "plan_meal":
        missing.append("budget_php")
        clarification = "Magkano po ang ating target budget para sa lulutuing ulam?"

    return AgentInterpretResponse(
        intent=intent,
        budget_php=budget_php,
        servings=servings,
        meal_scope="single_meal",
        meal_type=meal_type,
        pantry_mentions=pantry_mentions,
        excluded_ingredients=excluded,
        max_prep_minutes=None,
        missing_required_fields=missing,
        clarification_question=clarification,
        confidence_note="Interpreted on-device via local parser; verified local execution.",
    )
