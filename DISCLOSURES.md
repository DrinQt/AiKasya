# AIKasya — Official Hackathon Disclosures

**Event:** AppBuildersPH Hackathon 2026  
**Theme:** Local AI  
**Project:** AIKasya — *"Kasya sa budget. Swak sa hapag!"*  
**Date:** October 9–10, 2026  

---

### A. Models Used
* **Primary On-Device Model:** Llama-3.2-3B-Instruct (Meta)
* **Checkpoint/Model Version + Quantization:** `llama3.2:3b` (4-bit quantization, `Q4_K_M`, ~2.0 GB)
* **Source URL & License:** https://github.com/meta-llama/llama-models / Llama 3.2 Community License
* **Secondary Supported Local Model:** Qwen2.5-1.5B-Instruct (`qwen2.5:1.5b`, Apache 2.0)
* **Model Inference Runtime:** Ollama local service on `127.0.0.1:11434`
* **Hardware/OS where inference runs:** Windows 11, NVIDIA GeForce RTX 3050 Laptop GPU (4 GB VRAM), 16 GB System RAM.
* **What the model does locally:**
  - Natural English, Filipino, and Taglish intent understanding.
  - Extraction of constraints: budget in PHP, servings, meal type (breakfast, lunch, dinner, snack/merienda), pantry mentions, and allergen exclusions.
  - Generation of structured, schema-compliant JSON payloads for downstream tools.
  - *Does NOT calculate money or fabricate prices.*
* **Offline Proof & Measured Latency:** 
  - Verified working with Wi-Fi / Ethernet physically disconnected.
  - Latency measured on demo laptop (RTX 3050 Laptop GPU): about 1.2 to 1.8 seconds for natural language constraint extraction, and ~10 to 20 ms for deterministic recipe optimization.

---

### B. Technologies and Frameworks
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide icons (all assets bundled locally, zero CDN)
* **Backend:** Python 3.11, FastAPI, Uvicorn, Pydantic v2
* **Database:** SQLite (embedded local file `data/aikasya.db`)
* **Optimization / Math:** Pure Python deterministic arithmetic with Decimal monetary precision: exhaustive evaluation of every local recipe against exact purchasable costs (vendor pack sizes, pantry subtraction), filtered by budget, exclusions and meal type, then ranked. Not machine learning.
* **Data tooling (offline price updates only, not needed to run the app):** openpyxl
* **Local AI Runtime:** Ollama (`ollama.exe`)
* **Testing:** Pytest, pytest-asyncio, Playwright browser test suite

---

### C. APIs and Cloud Services
* **Core AI API Usage:** **NONE.** 100% local on-device inference.
* **External Price Sources (downloaded once, used offline; cited per row in backend/data/prices.json):**
  - **PSA:** "Price Situationer of Selected Agricultural Commodities, Second Phase of September 2026" (NCR averages, reference period 15-17 Sep 2026; 20 ingredients). Original workbook kept in `backend/data/sources/`. https://psa.gov.ph/statistics/price-situationer/selected-agri-commodities/node/1684084237
  - **DA-AMAS:** "Retail Price of Selected Agri-fishery Commodities at NCR Markets", 1 March 2025 (4 ingredients). https://da.gov.ph/wp-content/uploads/2025/03/Price-Monitoring-March-1-2025.pdf
  - **DTI:** "Suggested Retail Prices of Basic Necessities and Prime Commodities", as of 1 February 2025 (5 ingredients). https://esigaw.dti.gov.ph/wp-content/uploads/2025/02/BNPC-SRP-BULLETIN-01-FEBRUARY-2025.002.pdf
  - **16 prices are AI-generated estimates** (labeled `demo_seed` in the app); none were observed at a market. Users override any price in Market Mode.
* **Cloud Hosting / Analytics / Auth:** None.
* **Offline vs Internet:** Core application (interpretation, planning, repricing, pantry management) works 100% offline. Internet is optional only for future cloud sync.

---

### D. Existing Code and Assets
* **Pre-hackathon Code Reused:** None. Substantially built during the hackathon period.
* **Open-source Starter / Templates:** None. Built from scratch.
* **Data Sources:** 19 Filipino recipes (16 ulam, 3 merienda/fruit) and 45 ingredients, maintained by the Data Science lead in `backend/data/*.json` and seeded into SQLite. Recipe quantities and steps were written for this project with AI assistance; no recipe text was copied. Every price carries provenance (`official_reference` with document citation, `user_entered`, or `demo_seed` estimate).
* **Third-party data files included:** PSA September 2026 statistical tables workbook (public government release), used only as the source of the PSA prices above.

---

### E. AI Development Tools
* **Claude (Anthropic), used by the Data Science lead:** finding and verifying official price sources (PSA/DA/DTI), extracting the PSA workbook by script, the Data Science dataset (ingredients, recipes, price provenance), the budget engine package (`backend/app/budget_engine`), data fixes in the backend (seed loading, price-update purchase step, meal_type filter), tests and documentation.
* **Google Antigravity / Gemini, used by the Backend & Local AI lead:** project architecture, Section 9 REST contracts, Pydantic schemas, SQLite database query integration, Ollama local model runtime adapter, and automated QA test suites.**

---

### F. Mandatory Question: Why does this product benefit from running AI locally?

AIKasya is designed for real shopping decisions made at Philippine public markets (*palengke*) and at home, where mobile data connectivity is frequently unreliable or expensive, and household food budgets fluctuate daily. 

A local language model running on-device understands everyday Filipino/Taglish requests, extracts budget and pantry constraints, and routes them to deterministic local planning tools without sending personal household data to cloud servers. 

Crucially, when shoppers encounter real-time vendor prices at the market (e.g., *"tilapia is ₱190/kg today"*), AIKasya can immediately re-optimize the meal plan and recalculate remaining funds entirely offline. Instant recalculation, zero cloud dependency, and zero subscription costs for the families who need it most.
