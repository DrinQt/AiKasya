from fastapi import APIRouter
from app.models.schemas import HealthResponse
from app.local_ai.client import check_ollama_status, DEFAULT_MODEL

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def get_health():
    ai_status = await check_ollama_status()
    is_ready = ai_status.get("running", False) and DEFAULT_MODEL in ai_status.get("models", [])
    active_model = ai_status.get("active_model", "Local Engine")

    return HealthResponse(
        status="ok",
        local_model_ready=is_ready,
        db_ready=True,
        active_model_label=active_model,
        offline_capable=True,
        hardware_notes="On-device local execution; 0 cloud AI dependencies.",
    )
