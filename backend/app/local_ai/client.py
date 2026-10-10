import json
import re
import httpx
from typing import Optional, Dict, Any
from app.models.schemas import AgentInterpretResponse
from app.local_ai.prompts import SYSTEM_PROMPT_INTERPRET
from app.local_ai.parser import MEAL_ACTION, parse_and_validate_llm_json, rule_assisted_taglish_fallback

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "llama3.2:3b"


async def check_ollama_status() -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", [])]
                active = DEFAULT_MODEL if DEFAULT_MODEL in models else f"None ({DEFAULT_MODEL} not installed)"
                return {
                    "running": True,
                    "models": models,
                    "active_model": active,
                }
    except Exception:
        pass
    return {"running": False, "models": [], "active_model": "None (Offline Local Engine Ready)"}


async def interpret_user_request(
    message: str,
    existing_constraints: Optional[Dict[str, Any]] = None,
    model_name: str = DEFAULT_MODEL,
) -> AgentInterpretResponse:
    prompt = f"User Request: {message}\nExisting Constraints: {json.dumps(existing_constraints or {})}"
    from app.database import get_all_ingredients_db, get_latest_prices_map
    prices = get_latest_prices_map()
    catalog = [{"id": item["ingredient_id"], "name": item["canonical_name"], "unit": item["base_unit"],
                "price_per_unit": prices[item["ingredient_id"]]["normalized_price_per_base_unit"]}
               for item in get_all_ingredients_db() if item["ingredient_id"] in prices]
    prompt += "\nCurrent saved food-price catalog (PHP, not live market prices): " + json.dumps(catalog)
    fallback = rule_assisted_taglish_fallback(message, existing_constraints)
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "model": model_name,
                "prompt": prompt,
                "system": SYSTEM_PROMPT_INTERPRET,
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": 0.1,
                    "num_predict": 256,
                },
            }
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload)
            if resp.status_code == 200:
                raw_response = resp.json().get("response", "")
                parsed = parse_and_validate_llm_json(raw_response)
                if parsed:
                    fb = rule_assisted_taglish_fallback(message, existing_constraints)
                    parsed.budget_basis = fb.budget_basis
                    parsed.skipped_meals = fb.skipped_meals
                    # A comparison is explicit and temporary; never infer it from saved constraints.
                    parsed.scenario_budget_php = fb.scenario_budget_php
                    if fb.scenario_budget_php is not None:
                        parsed.intent = fb.intent
                    if (existing_constraints or {}).get("free_chat"):
                        explicit = rule_assisted_taglish_fallback(message, {"free_chat": True})
                        if explicit.budget_php is not None:
                            parsed.budget_php = explicit.budget_php
                        if explicit.servings is not None:
                            parsed.servings = explicit.servings
                        if explicit.days is not None:
                            parsed.days = explicit.days
                        if parsed.intent == "adjust_budget":
                            parsed.intent = fb.intent
                        # Accept model extraction only for details actually discussed, never invented defaults.
                        if not re.search(r"\b(?:budget|badyet|pesos?|php)\b|₱", message.lower()) or parsed.budget_php is None:
                            parsed.budget_php = fb.budget_php
                        if not re.search(r"\b(?:people|persons?|pax|tao|kami|we)\b", message.lower()) or parsed.servings is None:
                            parsed.servings = fb.servings
                        if not re.search(r"\b(?:days?|araw|today|tonight)\b", message.lower()) or parsed.days is None:
                            parsed.days = fb.days
                        missing = []
                        if parsed.budget_php is None:
                            missing.append("budget_php")
                        if parsed.intent != "buy_food":
                            if parsed.servings is None:
                                missing.append("servings")
                            if parsed.days is None:
                                missing.append("days")
                        labels = {"budget_php": "your total budget in pesos", "servings": "how many people", "days": "how many days"}
                        parsed.missing_required_fields = missing
                        parsed.clarification_question = "Tell me " + ", ".join(labels[field] for field in missing) + "." if missing else None
                    if fb.intent == "buy_food":
                        parsed.intent = "buy_food"
                    # Never invent named items for a general request. The basket builder selects them.
                    parsed.shopping_items = fb.shopping_items
                    parsed.pantry_empty = parsed.pantry_empty or fb.pantry_empty
                    if parsed.budget_php is None or "budget_php" in parsed.missing_required_fields or (any(w in message.lower() for w in ["daan", "libo"]) and fb.budget_php is not None):
                        if fb.budget_php is not None:
                            parsed.budget_php = fb.budget_php

                    if parsed.servings is None:
                        parsed.servings = fb.servings

                    if fb.excluded_ingredients and not parsed.excluded_ingredients:
                        parsed.excluded_ingredients = fb.excluded_ingredients

                    if fb.pantry_mentions:
                        for pm in fb.pantry_mentions:
                            if pm not in parsed.pantry_mentions:
                                parsed.pantry_mentions.append(pm)

                    if parsed.budget_php is not None:
                        parsed.missing_required_fields = [f for f in parsed.missing_required_fields if f != "budget_php"]
                        if not parsed.missing_required_fields:
                            parsed.clarification_question = None
                    # Day references in skip commands must not become a new plan duration.
                    if MEAL_ACTION.search(message.lower()):
                        parsed.intent = "plan_meal"
                        parsed.days = fb.days
                        parsed.excluded_ingredients = fb.excluded_ingredients
                    if "skipped_meals" in fb.missing_required_fields:
                        parsed.missing_required_fields.append("skipped_meals")
                        parsed.clarification_question = fb.clarification_question
                    parsed.confidence_note = f"Parsed on-device by local {model_name}; verified 100% offline."
                    return parsed
    except Exception:
        pass

    return rule_assisted_taglish_fallback(message, existing_constraints)
