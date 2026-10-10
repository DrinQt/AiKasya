# AIKasya — Backend & Local AI Service

> **"Kasya sa budget. Swak sa hapag!"**  
> Built for **AppBuildersPH Hackathon 2026** — Theme: **Local AI**

AIKasya is an offline-first, on-device AI budget-to-meal assistant. It translates household food budgets, available pantry stock, and actual local market prices into feasible Filipino meal plans with exact deterministic calculations.

---

## Architecture & Guarantees
- **100% On-Device Local Inference:** Uses local Ollama runtime (`llama3.2:3b`) running directly on the demo laptop. Zero third-party cloud LLM API calls.
- **Deterministic Math & Constraints:** Recipe scaling, unit conversion, pantry subtraction, and price calculations are calculated in pure Python with `Decimal` precision. The LLM never hallucinates costs or invents recipes.
- **Offline Operational:** Operates with Wi-Fi/Ethernet completely disconnected during live demos.

---

## Quickstart

### 1. Prerequisites
- Python 3.11+
- [Ollama](https://ollama.com/) with `llama3.2:3b` model:
  ```powershell
  ollama pull llama3.2:3b
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

Opening the chatbot calls `/api/agent/start`. The backend reuses an existing Ollama server or launches `ollama serve` in the background on localhost. It looks on PATH and in standard Windows installation directories. The UI waits for startup and reports missing installations or models with a Retry button. Install Ollama and download the model once; entering chat does not download software or models. Ollama stays running after leaving chat so other local applications can keep using it.

To see Ollama in a local PowerShell terminal, run `powershell -ExecutionPolicy Bypass -File .\scripts\start-ollama.ps1` from the repository root. Keep that terminal open. In another terminal, run the same command with `-DownloadModel` for the one-time model download. Windows startup disables Vulkan by default to avoid driver discovery stalls; an explicit `OLLAMA_VULKAN=1` environment setting restores it. CPU or CUDA inference remains available. Startup allows up to 60 seconds for initial hardware discovery.

### 4. Run Smoke Tests
```powershell
pytest -v
```

### Daily meal schedules

Send `meal_scope: "day"`, `days: 2`, and the typed budget to `/api/plans/generate`. `budget_basis: "total"` divides the amount between days in exact cents; `"per_day"` allocates that amount to each day. The response's `schedule` contains breakfast, lunch and dinner, each with new purchase cost, remaining daily allowance and remaining overall budget. Inventory is consumed across meals and days, including leftover quantities from rounded purchase sizes. These are planned purchases, not recorded transactions. Missing meal slots are marked explicitly and return `partial` or `no_match`; the scheduler never overspends to fill them.

---

## API Endpoints (Section 9 Contracts)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Check local model readiness and offline capability status |
| `POST` | `/api/agent/interpret` | Interpret English/Taglish shopping queries into structured JSON |
| `POST` | `/api/agent/start` | Start or reuse local Ollama and check the configured model |
| `POST` | `/api/plans/generate` | Compute feasible meals under budget with pantry offsets |
| `POST` | `/api/plans/reprice` | Recalculate a recipe option against real-time vendor prices |
| `POST` | `/api/prices/upsert` | Update local vendor prices with provenance metadata |
| `GET` | `/api/recipes` | List curated Filipino recipes |
| `GET` | `/api/recipes/{id}` | Detailed recipe with portioned ingredients & steps |
| `GET` | `/api/ingredients` | Searchable ingredients with reference prices |
| `GET` | `/api/pantry` | Inspect on-hand pantry stock |
| `POST` | `/api/pantry/upsert` | Add or update on-hand pantry item |
Meal schedules support `skipped_meals: [{"day": 2, "meal_type": "breakfast"}]`.
Chat accepts instructions such as "Skip breakfast on Day 2" and "Include breakfast on Day 2".
Only the latest schedule has Skip/Include controls. Changes regenerate the schedule using the same budget,
people, days and exclusions. Skipped slots cost zero, consume no inventory, and leave daily and total
balances unchanged. Unspent amounts stay in the original daily allocation. A requested skip is distinct
from a meal that could not be planned; skipped slots do not make a plan incomplete.

### Shopping, meal choices and conclusions

General shopping requests use an empty `shopping_items` array. The backend builds a varied food basket from current database prices and recorded purchase increments, minimizing the remaining balance without overspending. Explicit named quantities stay fixed and use their recorded units. The interpreter receives the current price catalog; it does not invent prices or shopping quantities. Meal schedules include recipe `steps` and may separately buy extra groceries with leftover funds after all included meals fit. These extras carry into subsequent days as stock; they do not inflate servings. Entirely skipped days spend nothing.

`POST /api/plans/alternatives` accepts planning constraints plus `target_day`, `target_meal_type` and `exclude_recipe_id`. It returns up to three alternatives with fully recalculated, feasible schedules. `meal_choices` preserves a selected recipe for a day and meal. Existing exclusions, serving counts, skipped meals and budget apply to the replacement's entire schedule.

The frontend merges recipes into meal planning and starts a new conversation when switching to shopping. Each feature stores its latest conclusion in Insights; drafts are not accumulated as actual spending. Removing a shopping item recomputes its list total and restores that cost to available balance, without increasing the original budget. Removing a grocery item similarly updates its list total. Insights reset clears conclusions and starts a new checked-purchase tracking period while retaining grocery items. Grocery reset clears the list. Both reset immediately and persist offline. Leftover budget is unspent money, not earnings; discounts require a recorded comparison price.
