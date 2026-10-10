# AIKasya — Frontend (Progressive Web App)

> **"Kasya sa budget. Swak sa hapag!"**  
> Built for **AppBuildersPH Hackathon 2026** — Theme: **Local AI**

The AIKasya frontend is an offline-first food budgeting and meal planning app built with React, Vite, TypeScript, and Tailwind CSS. It talks to the local FastAPI backend and on-device Ollama model on the same laptop. It turns a budget, household size, planning days, pantry, and allergies into daily meal schedules, meal options, and shopping lists.

---

## Architecture & Guarantees
- **Local Backend Only:** Calls `http://127.0.0.1:8000/api` by default. All meal plans, costs, and chat answers come from the local backend and on-device model (`llama3.2:3b`), or from the backend's rule-based parser when Ollama is unavailable. No cloud account or sync.
- **No Fabricated Answers:** When the backend is unavailable, the planner shows an explicitly labeled sample, and chat reports the connection error instead of making up a reply. Backend errors never clear device data.
- **Labeled Prices:** Every price keeps its source label:
  - official (29 from PSA Sep 2026 NCR, DA, DTI)
  - demo estimate (16, clearly labeled)
  - user-entered

  No live market feed is implied.
- **Offline-First PWA:** The production build caches interface files, fonts, official images, food photos, and icons with a Workbox service worker. User data stays in the browser under the `aikasya.v1` localStorage key.

---

## Quickstart

### 1. Prerequisites
- Node.js
- Python 3.11+ and the backend dependencies (see `backend/README.md`)
- [Ollama](https://ollama.com/) with `llama3.2:3b` (one-time download while online)

### 2. Install Dependencies
```powershell
cd "front end"
npm install
```

### 3. Run Backend + Frontend Together
From the repository root or `front end`:
```powershell
npm.cmd run dev
```
This starts both services; if the backend is already running, the launcher reuses it. Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`.

Frontend only:
```powershell
npm.cmd run dev:frontend
```

Backend only (PowerShell):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

To change the backend address, set `VITE_API_BASE_URL` in a local `.env.local` file and restart Vite. For a phone using another computer's backend, use that computer's reachable address; `localhost` on a phone means the phone itself. The backend must keep running for plans and chat, even with the internet disconnected.

### 4. Production Build (PWA)
```powershell
npm run build
npm run preview
```
The preview includes the service worker and install manifest. Service workers are disabled in development to avoid stale files. Hosting requires HTTPS; localhost works for testing. Open the production app online once and let the service worker finish installing before going offline.

### 5. Run Tests
```powershell
npx playwright install chromium
npm test
npm run test:offline
```
`npx playwright install chromium` is a one-time download and needs internet. Responsive tests cover 320, 390, 768, and 1440 px widths in both languages. Screenshots go to the ignored `screenshots/` folder. The offline check builds the app and tests offline reload, saved grocery changes, cached images, and the manifest.

Real browser + backend smoke test (backend already running, inside `front end`):
```powershell
$env:AIKASYA_LIVE_BACKEND = "1"
npx playwright test tests/live-backend.spec.ts
```
Ordinary browser tests use controlled API responses or simulate an unavailable backend, so they do not need a running service.

---

## Screens

| Screen | What it does |
|---|---|
| Welcome | Official mascot, logo, unchanged tagline, and Get Started |
| Home | Saved budget, household size, planning days, and shortcuts; tapping the mascot opens chat |
| Budget Setup | Validated budget, 1–20 people, 1–30 days, and household food allergies |
| Meal Planner | Start screen (budget, people, days, allergies), then a planning chat that builds a daily schedule from the backend: per-meal cost, remaining daily and total balance, Skip/Include, up to three alternatives per meal, and a plan conclusion |
| AI Chat | Free chat with local interpretation, calculated meal options, shopping lists within the budget, clarification questions, and saved conversations |
| Recipe Details | Backend ingredients scaled to the selected servings and actual cooking steps |
| Grocery List | Saved checkboxes, editable prices, and calculated totals |
| Market Mode | Purchase checks, price editing, purchased total, and remaining budget; comparisons and price history are placeholders |
| My Pantry | Add and remove ingredients with quantities |
| Insights | Latest conclusion from each feature, checked grocery spending, and budget proportions; weekly bars are labeled sample data |
| More / Settings | English/Filipino preference, budget shortcut, install action, information, tips, and confirmed data reset |

Hash navigation supports reloads and browser Back. Clear Data restores the sample dataset and keeps the selected language. Donation is a placeholder.

---

## Backend Integration

### Budget, people and days
People controls recipe servings; Days divides the saved budget into a daily allowance. The Meal Planner sends budget, people, and days to the backend, which builds a complete daily schedule within each day's allowance (`budget_basis`: `total` or `per_day`).

Chat defaults to the Home settings and uses the full saved budget for its meal options. For example, `2000 budget, 3 days` sends PHP 2000 to the backend and keeps Home at PHP 2000 over 3 days. Explicit budgets, days, and people typed in a message update the shared Home settings before calculation; `500 budget 1 day` sets a PHP 500 total budget for one day. Suggested-budget and fewer-people actions also update those settings. Selecting a chat result opens that exact recipe without recalculating it under different constraints.

### Pantry
Pantry edits save on the device. **Save pantry to backend** syncs the whole device pantry; **Load backend pantry** replaces it with the backend stock. Quantities must use compatible units such as `500 g`, `1 kg`, `250 ml`, or `3 pcs`. Unknown or duplicate ingredients and incompatible units must be corrected before saving. The planner uses the current device pantry and reports entries it cannot count.

### Prices
After editing grocery costs, **Save prices to backend** stores valid entries as user-entered prices with the quantity and unit they cover. Invalid entries are skipped with a visible count. Backend meal selections add their calculated quantities and costs to the grocery list.

---

## Repository Structure

```text
src/App.tsx               Routing and state integration
src/api.ts                Backend API client and types
src/components.tsx        Shared branded components and navigation
src/components/           Meal schedule, number picker, plan conclusion, food allergies
src/screens/              Individual screen components
src/chatPresentation.ts   Chat reply formatting for plans and shopping lists
src/planInsights.ts       Feature conclusions stored for Insights
src/plannerUI.ts          Planner helpers
src/allergies.ts          Allergy options sent to the backend
src/i18n.ts               Typed English and Filipino dictionaries
src/state.ts              Local persistence and validation
src/data.ts               Sample data
src/pwa.ts                Native installation prompt
src/styles.css            Tailwind theme and reference-based styles
scripts/dev.mjs           Starts backend and frontend together
public/assets/            Official images and credited food photos
public/icons/             App icons from the official mascot
tests/                    Browser interaction and responsive checks
tests/offline/            Production offline reload check
```

`src/screens/MealPlanner.tsx` and `src/screens/ConnectedMeals.tsx` are earlier planner versions and are not currently routed.

---

## Assets
- **Official images:** Copied from the supplied `logo.png` and `mascot.png`.
- **Transparent versions:** `aikasya-logo-transparent.png` and `aikasya-mascot-transparent.png` were made with an AI image-generation tool in background-removal mode. The originals are retained; see `public/assets/transparent-assets.md`.
- **Food photographs:** Credited in [public/assets/CREDITS.md](public/assets/CREDITS.md) and in About AiKasya.
- **Font:** Nunito, bundled locally.
- **Regenerating assets:** `npm run assets:prepare` recreates app icons and re-downloads food photos. It needs network access and is not needed for normal development.
