from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routes import health, agent, plans, prices, recipes, pantry, ingredients


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AIKasya Backend API",
    description="Offline-first on-device AI budget-to-meal assistant backend for AppBuildersPH 2026",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(agent.router)
app.include_router(plans.router)
app.include_router(prices.router)
app.include_router(recipes.router)
app.include_router(pantry.router)
app.include_router(ingredients.router)


@app.get("/")
def read_root():
    return {
        "project": "AIKasya",
        "tagline": "Kasya sa budget. Swak sa hapag!",
        "status": "online",
        "mode": "offline-capable local execution",
    }
