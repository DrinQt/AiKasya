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


MEAL_WORDS = {"breakfast": "breakfast", "almusal": "breakfast", "agahan": "breakfast",
              "lunch": "lunch", "tanghalian": "lunch", "dinner": "dinner", "hapunan": "dinner"}
MEAL_PATTERN = "|".join(MEAL_WORDS)
MEAL_ACTION = re.compile(rf"\b(skip|no|without|walang|wala|ayaw ko(?: ng)?|(?:i\s+)?(?:don't|dont|do not) want|include|restore|add back|(?:don't|dont|do not) skip)\s+(?=(?:{MEAL_PATTERN})\b)")


def meal_skips(message, constraints, days):
    """Apply explicit meal omissions/restorations without confusing day references with duration."""
    skips = {(int(item["day"]), item["meal_type"]) for item in constraints.get("skipped_meals", [])}
    changed = False
    needs_days = False
    for clause in re.split(r"[;.!?\n]|\band\s+(?=(?:skip|no|include|restore|don't|do not|walang)\b)", message):
        actions = list(MEAL_ACTION.finditer(clause))
        for action_index, action in enumerate(actions):
            changed = True
            end = actions[action_index + 1].start() if action_index + 1 < len(actions) else len(clause)
            segment = clause[action.end():end]
            mentions = list(re.finditer(rf"\b({MEAL_PATTERN})\b", segment))
            prefix_days = re.findall(r"\b(?:days?|araw)\s*(\d+)\b", clause[:action.start()])
            restoring = action.group(1) in ("include", "restore", "add back", "don't skip", "dont skip", "do not skip")
            for index, mention in enumerate(mentions):
                next_start = mentions[index + 1].start() if index + 1 < len(mentions) else len(segment)
                suffix = segment[mention.end():next_start]
                day_numbers = re.findall(r"\b(?:days?|araw)\s*(\d+)\b", suffix)
                # A trailing day applies to a meal list: "skip breakfast and lunch on day 2".
                if not day_numbers:
                    day_numbers = re.findall(r"\b(?:days?|araw)\s*(\d+)\b", segment[mention.end():]) or prefix_days
                if not day_numbers:
                    if days is None:
                        needs_days = True
                        continue
                    day_numbers = range(1, days + 1)
                for day in day_numbers:
                    key = (int(day), MEAL_WORDS[mention.group(1)])
                    if restoring:
                        skips.discard(key)
                    else:
                        skips.add(key)
    error = None
    if needs_days:
        error = "Which day should I skip that meal, or how many days should this plan cover?"
    elif any(day < 1 or (days is not None and day > days) for day, _ in skips):
        error = f"Choose a skipped meal day within your {days}-day plan, or tell me a new plan duration."
    return [{"day": day, "meal_type": meal} for day, meal in sorted(skips) if day >= 1], changed, error


def rule_assisted_taglish_fallback(message: str, existing_constraints: Optional[Dict[str, Any]] = None) -> AgentInterpretResponse:
    msg = message.lower()
    constraints = existing_constraints or {}
    free_chat = constraints.get("free_chat", False)
    budget_basis = "per_day" if re.search(r"\b(?:per day|each day|a day|daily|bawat araw|kada araw)\b", msg) else constraints.get("budget_basis", "total")
    if re.search(r"\b(?:total budget|total of|kabuuang)\b", msg):
        budget_basis = "total"

    pantry_empty = bool(re.search(r"(?:\b(?:no|empty)\s+(?:food\s+(?:in\s+(?:my|the)\s+)?)?pantry|pantry\s+is\s+empty|(?:don['’]?t|do not)\s+have\s+(?:any\s+)?foods?\s+in\s+(?:my\s+)?pantry|wala(?:ng)?\s+(?:akong\s+)?(?:pagkain|laman|stock)(?:\s+sa\s+(?:pantry|kusina))?)", msg))
    buying_food = pantry_empty or bool(re.search(r"(?:\bbuy\b|shopping|grocery list|list.*(?:buy|items)|tingi|piraso|ano.*(?:mabibili|bibilhin)|walang recipe|no recipe)", msg))
    intent: AllowedIntent = constraints.get("intent") if constraints.get("intent") in ("plan_meal", "view_recipe", "buy_food") else "plan_meal"
    if buying_food:
        intent = "buy_food"
    elif any(k in msg for k in ["presyo", "price", "magkano", "per kilo", "kada kilo"]):
        intent = "update_price"
    elif any(k in msg for k in ["palitan", "swap", "substitute", "iba naman"]):
        intent = "swap_ingredient"
    elif any(k in msg for k in ["recipe", "paano lutuin", "steps", "how to cook"]):
        intent = "view_recipe"
    elif any(k in msg for k in ["add to pantry", "update pantry", "dagdag sa kusina"]):
        intent = "update_pantry"
    elif any(k in msg for k in ["bawas budget", "dagdag budget", "adjust"]):
        intent = "adjust_budget"
    elif any(k in msg for k in ["meal ideas", "meal plan", "plan meals", "magplano"]):
        intent = "plan_meal"

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
            r"(?:php\s*|₱\s*)?(\d+(?:\.\d+)?)\s*(?:per|each|a|bawat|kada)\s*(?:day|araw)",
            r"(?:php\s*|₱\s*)?(\d+(?:\.\d+)?)\s+for\s+(?:the|a|one)\s+day",
            r"[₱p]?\s*(\d+(?:\.\d+)?)\s*(?:pesos|peso|php|budget|lang|para sa)",
            r"(?:budget(?:\s+(?:ko|namin))?(?:\s*(?:ng|is|ay|=|:))?|may|meron(?:g)?)\s*(?:php\s*|[₱p]\s*)?(\d+(?:\.\d+)?)",
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

    hypothetical = bool(re.search(r"\b(?:what\s+if|how\s+about|suppose|paano\s+kung|halimbawa|kung\s+(?:ang\s+)?(?:budget|badyet)|if\s+my\s+budget)\b", msg))
    scenario_budget = budget_php if hypothetical else None
    if scenario_budget is not None and intent == "adjust_budget":
        intent = constraints.get("intent") if constraints.get("intent") in ("plan_meal", "view_recipe", "buy_food") else "plan_meal"
    if budget_php is None:
        budget_php = constraints.get("budget_php")

    if free_chat and budget_php is None and re.fullmatch(r"\s*\d+(?:\.\d+)?\s*", msg) and constraints.get("budget_php") is None:
        budget_php = float(msg.strip())
    servings = constraints.get("servings") or (None if free_chat else 4)
    found_digit = False
    servings_patterns = [
        r"(?:ng|para sa|good for|for)\s*(\d+)\s*(?:tao|persons?|people|pax)" if free_chat else r"(?:ng|para sa|good for|for)\s*(\d+)\s*(?:tao|persons?|people|pax)?",
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

    meal_type = None
    english_numbers = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                       "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
    if free_chat:
        for word, number in english_numbers.items():
            if re.search(rf"\b{word}\s+(?:people|persons?|pax)\b", msg):
                servings = number
    days = constraints.get("days")
    day_match = re.search(r"\b(\d+)\s*(?:days?|araw)\b", msg)
    if day_match:
        days = int(day_match.group(1))
    elif re.search(r"\b(?:isang araw|one day)\b", msg):
        days = 1
    else:
        for word, number in english_numbers.items():
            if re.search(rf"\b{word}\s+days?\b", msg):
                days = number
    if free_chat and intent == "adjust_budget":
        intent = constraints.get("intent") if constraints.get("intent") in ("plan_meal", "view_recipe", "buy_food") else "plan_meal"
    if free_chat and re.search(r"\b(?:just me|only me|ako lang|para sa akin)\b", msg):
        servings = 1
    if free_chat and re.fullmatch(r"\s*\d+\s*", msg) and constraints.get("budget_php") is not None:
        if constraints.get("servings") is None:
            servings = int(msg.strip())
        elif constraints.get("days") is None:
            days = int(msg.strip())
    skipped_meals, skip_command, skip_error = meal_skips(msg, constraints, days)
    if skip_command:
        intent = "plan_meal"
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
    # Exclusions and allergies ("walang baboy", "allergic ako sa hipon", "allergic to shrimp and peanuts").
    # Word boundaries matter: "at"/"and" must be whole words, otherwise "walang patis" became "p".
    exclusion_patterns = [
        r"\b(?:walang|ayaw ko ng|ayaw namin ng|ayaw ng|bawal ang|bawal|iwas sa|no|without)\s+([a-z][a-z\s]*?)(?=,|\.|;|\bpero\b|\bbut\b|\d|$)",
        r"\b(?:allergic|allergy|allergies|alergic|alerdyik|alerdyi|may allergy)\s+(?:ako\s+|kami\s+|siya\s+|po\s+)*(?:sa|to|ng|in)?\s*([a-z][a-z\s]*?)(?=,|\.|;|\bpero\b|\bbut\b|\d|$)",
    ]
    filler = {"lang", "po", "kami", "ako", "na", "ang", "mga", "the", "any", "please", "pls", "sana"}
    exclusion_message = re.sub(r"\bno recipe\b", "", msg)
    exclusion_message = re.sub(rf"\b(?:no|without|walang)\s+(?:{MEAL_PATTERN})\b[^;.!?]*", "", exclusion_message)
    if pantry_empty:
        exclusion_message = re.sub(r"\b(?:no|walang)\s+(?:food|pagkain|laman|stock|pantry)\b[^.!?]*", "", exclusion_message)
    for pattern in exclusion_patterns:
        for m in re.finditer(pattern, exclusion_message):
            for part in re.split(r"\s*(?:,|\bat\b|\band\b|\bor\b|\bo\b)\s*", m.group(1)):
                ex_item = " ".join(w for w in part.split() if w not in filler).strip()
                if ex_item and ex_item not in ["kanin", "bawang"] and ex_item not in excluded:
                    excluded.append(ex_item)

    missing: List[str] = []
    clarification: Optional[str] = None
    if budget_php is None and intent in ("plan_meal", "buy_food"):
        missing.append("budget_php")
        clarification = "Magkano po ang ating target budget para sa lulutuing ulam?"
    if free_chat:
        missing = []
        if budget_php is None:
            missing.append("budget_php")
        if intent != "buy_food":
            if servings is None:
                missing.append("servings")
            if days is None:
                missing.append("days")
        labels = {"budget_php": "your total budget in pesos", "servings": "how many people", "days": "how many days"}
        clarification = "Tell me " + ", ".join(labels[field] for field in missing) + "." if missing else None
    if skip_error:
        clarification = skip_error
        missing.append("skipped_meals")

    time_match = re.search(r"(?:within|under|max(?:imum)?|sa loob ng)\s+(\d+)\s*(?:minutes|minuto|mins?)", msg)
    shopping_items = []
    if intent == "buy_food":
        from data.seed_data import INGREDIENTS_SEED
        shopping_message = msg
        for pattern in exclusion_patterns:
            shopping_message = re.sub(pattern, "", shopping_message)
        unit_names = {"pcs": "piece", "pc": "piece", "pieces": "piece", "piece": "piece",
                      "can": "piece", "cans": "piece",
                      "piraso": "piece", "kg": "kg", "kilo": "kg", "kilos": "kg", "g": "g",
                      "grams": "g", "gram": "g", "ml": "ml", "l": "L", "liters": "L"}
        for food in INGREDIENTS_SEED:
            terms = [food["ingredient_id"], food["canonical_name"], *food["aliases"]]
            if food["ingredient_id"] == "eggs":
                terms.append("egg")
            aliases = "|".join(re.escape(term.lower()) for term in sorted(set(terms), key=len, reverse=True))
            item_match = re.search(rf"(?:(\d+(?:\.\d+)?)\s*(?:(pieces?|pcs?|cans?|piraso|kg|kilos?|grams?|g|ml|liters?|l)\s*(?:of\s*)?)?)?\b({aliases})\b", shopping_message)
            if item_match:
                qty = float(item_match.group(1)) if item_match.group(1) else (1 if food["base_unit"] == "piece" else food["default_purchase_increment"])
                term = "egg" if food["ingredient_id"] == "eggs" else item_match.group(3)
                item = {"term": term, "quantity": qty}
                if item_match.group(2):
                    unit = unit_names[item_match.group(2)]
                    if unit != food["base_unit"]:
                        item["unit"] = unit
                shopping_items.append(item)
        general_list = bool(re.search(r"list.*(?:items|things|buy)|what.*(?:buy|mabibili)|food.*buy|shopping list|grocery list|tingi", msg))
        if not shopping_items and not general_list and not pantry_empty:
            shopping_items = constraints.get("shopping_items") or []
    return AgentInterpretResponse(
        skipped_meals=skipped_meals,
        budget_basis=budget_basis,
        days=days,
        scenario_budget_php=scenario_budget,
        intent=intent,
        budget_php=budget_php,
        servings=servings,
        meal_scope="single_meal",
        meal_type=meal_type,
        pantry_mentions=pantry_mentions,
        pantry_empty=pantry_empty,
        shopping_items=shopping_items,
        excluded_ingredients=excluded,
        max_prep_minutes=int(time_match.group(1)) if time_match else None,
        missing_required_fields=missing,
        clarification_question=clarification,
        confidence_note="Interpreted on-device via local parser; verified local execution.",
    )
