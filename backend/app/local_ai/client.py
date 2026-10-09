import json
import httpx
from typing import Optional, Dict, Any
from app.models.schemas import AgentInterpretResponse
from app.local_ai.prompts import SYSTEM_PROMPT_INTERPRET
from app.local_ai.parser import parse_and_validate_llm_json, rule_assisted_taglish_fallback

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "llama3.2:3b"


async def check_ollama_status() -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", [])]
                active = DEFAULT_MODEL if any(DEFAULT_MODEL in m for m in models) else (models[0] if models else DEFAULT_MODEL)
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

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
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
                    parsed.confidence_note = f"Parsed on-device by local {model_name}; verified 100% offline."
                    return parsed
    except Exception:
        pass

    return rule_assisted_taglish_fallback(message, existing_constraints)
