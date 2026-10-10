from fastapi import APIRouter
from app.models.schemas import AgentInterpretRequest, AgentInterpretResponse
from app.local_ai.client import interpret_user_request
from app.local_ai.runtime import ensure_ollama_running

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/start")
async def start_local_ai():
    return await ensure_ollama_running()


@router.post("/interpret", response_model=AgentInterpretResponse)
async def interpret_request(req: AgentInterpretRequest):
    return await interpret_user_request(
        message=req.message,
        existing_constraints=req.existing_constraints,
    )
