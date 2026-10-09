# AIKasya — Official Hackathon Disclosures

**Event:** AppBuildersPH Hackathon 2026  
**Theme:** Local AI  
**Project:** AIKasya — *"Kasya sa budget. Swak sa hapag!"*  
**Date:** October 9–10, 2026  

---

### A. Models Used
* **Exact Name and Provider:** Qwen2.5-1.5B-Instruct (Qwen / Alibaba Cloud)
* **Checkpoint/Model Version + Quantization:** `qwen2.5:1.5b` (4-bit quantization, `q4_K_M`)
* **Source URL & License:** https://github.com/QwenLM/Qwen2.5 / Apache 2.0 License
* **Model Inference Runtime:** Ollama local service on `127.0.0.1:11434`
* **Hardware/OS where inference runs:** Windows 11, NVIDIA GeForce RTX 3050 Laptop GPU (4 GB VRAM), 16 GB System RAM.
* **What the model does locally:**
  - Natural English, Filipino, and Taglish intent understanding.
  - Extraction of constraints: budget in PHP, servings, meal type, pantry mentions, and allergen exclusions.
  - Generation of structured, schema-compliant JSON payloads for downstream tools.
  - *Does NOT calculate money or fabricate prices.*
* **Offline Proof / Actual Observed Limitations:** 
  - Verified working with Wi-Fi / Ethernet physically disconnected.
  - Operates with sub-second latency on local GPU.

---

### B. Technologies and Frameworks
* **Backend:** Python 3.11, FastAPI, Uvicorn, Pydantic v2
* **Database:** SQLite (embedded local file `data/aikasya.db`)
* **Optimization / Math:** Pure Python deterministic arithmetic with `Decimal` monetary precision
* **Local AI Runtime:** Ollama (`ollama.exe`)
* **Testing:** Pytest, pytest-asyncio

---

### C. APIs and Cloud Services
* **Core AI API Usage:** **NONE.** 100% local on-device inference.
* **External Price Sources:** Department of Agriculture (DA) Bantay Presyo published reference data (Oct 2026 reference seed) & Metro Manila public market vendor observations.
* **Cloud Hosting / Analytics / Auth:** None.
* **Offline vs Internet:** Core application (interpretation, planning, repricing, pantry management) works 100% offline. Internet is optional only for future cloud sync.

---

### D. Existing Code and Assets
* **Pre-hackathon Code Reused:** None. Substantially built during the hackathon period.
* **Open-source Starter / Templates:** None. Built from scratch.
* **Data Sources:** Curated 12+ Filipino recipes with portioning and 37+ market ingredients with provenance tags (`official_reference`, `user_entered`, `demo_seed`).

---

### E. AI Development Tools
* **AI Coding Assistants Used:** Google Antigravity / Gemini
* **Usage Description:** Assisted in scaffolding project structure, generating Pydantic schemas adhering to Section 9 contracts, writing seed data fixtures, and drafting unit tests.

---

### F. Mandatory Question: Why does this product benefit from running AI locally?

AIKasya is designed for real shopping decisions made at Philippine public markets (*palengke*) and at home, where mobile data connectivity is frequently unreliable or expensive, and household food budgets fluctuate daily. 

A local language model running on-device understands everyday Filipino/Taglish requests, extracts budget and pantry constraints, and routes them to deterministic local planning tools without sending personal household data to cloud servers. 

Crucially, when shoppers encounter real-time vendor prices at the market (e.g., *"tilapia is ₱190/kg today"*), AIKasya can immediately re-optimize the meal plan and recalculate remaining funds entirely offline. Zero latency, zero cloud dependency, and zero subscription costs for the families who need it most.
