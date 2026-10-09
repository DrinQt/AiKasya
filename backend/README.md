# AIKasya — Backend & Local AI Service

> **"Kasya sa budget. Swak sa hapag!"**  
> Built for **AppBuildersPH Hackathon 2026** — Theme: **Local AI**

AIKasya is an offline-first, on-device AI budget-to-meal assistant. It translates household food budgets, available pantry stock, and actual local market prices into feasible Filipino meal plans with exact deterministic calculations.

---

## Architecture & Guarantees
- **100% On-Device Local Inference:** Uses local Ollama runtime (`qwen2.5:1.5b`) running directly on the demo laptop. Zero third-party cloud LLM API calls.
- **Deterministic Math & Constraints:** Recipe scaling, unit conversion, pantry subtraction, and price calculations are calculated in pure Python with `Decimal` precision. The LLM never hallucinates costs or invents recipes.
- **Offline Operational:** Operates with Wi-Fi/Ethernet completely disconnected during live demos.

---

## Quickstart

### 1. Prerequisites
- Python 3.11+
- [Ollama](https://ollama.com/) with `qwen2.5:1.5b` model:
  ```powershell
  ollama pull qwen2.5:1.5b
  ```

### 2. Install Dependencies
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run Backend Server
```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The API is available at `http://127.0.0.1:8000`.  
Swagger documentation is available offline at `http://127.0.0.1:8000/docs`.

### 4. Run Smoke Tests
```powershell
pytest -v
```

---

## API Endpoints (Section 9 Contracts)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Check local model readiness and offline capability status |
| `POST` | `/api/agent/interpret` | Interpret English/Taglish shopping queries into structured JSON |
| `POST` | `/api/plans/generate` | Compute feasible meals under budget with pantry offsets |
| `POST` | `/api/plans/reprice` | Recalculate a recipe option against real-time vendor prices |
| `POST` | `/api/prices/upsert` | Update local vendor prices with provenance metadata |
| `GET` | `/api/recipes` | List curated Filipino recipes |
| `GET` | `/api/recipes/{id}` | Detailed recipe with portioned ingredients & steps |
| `GET` | `/api/ingredients` | Searchable ingredients with reference prices |
| `GET` | `/api/pantry` | Inspect on-hand pantry stock |
| `POST` | `/api/pantry/upsert` | Add or update on-hand pantry item |
