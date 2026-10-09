# AiKasya

Offline-first food budgeting and meal planning frontend built with React, Vite, TypeScript, and Tailwind CSS. The supplied mockup guides the cream backgrounds, forest green buttons, pale green cards, yellow accents, spacing, and navigation. Official logo and basket mascot images are included locally, unchanged.

## Run

Run the following commands from the `front end` folder.

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite, normally http://127.0.0.1:5173.

```sh
npm run build
npm run preview
```

The production preview includes the PWA service worker and installation manifest. Service workers are disabled in development to avoid stale files. Hosting requires HTTPS; localhost supports testing. Open the production app online once and let its service worker finish installing before going offline.

## Screens

- Welcome: official mascot, logo, unchanged tagline, and Get Started.
- Home: saved budget, household size, planning days, and shortcuts.
- AI Chat: local backend interpretation, calculated meal options, clarification questions, and saved conversations.
- Meal Planner: backend meal alternatives within the daily budget, with pantry offsets and source-labeled prices; explicitly labeled samples if the backend is unavailable.
- Grocery List: saved checkboxes, editable prices, and calculated totals.
- My Pantry: add and remove ingredients, including quantities.
- Insights: checked grocery spending and budget proportions; weekly bars are labeled sample data.
- More / Settings: saved English/Filipino preference, budget shortcut, installation action, information, tips, and confirmed data reset.
- Recipe Details: backend ingredients scaled to the selected servings and actual cooking steps; sample placeholders remain only in sample mode.
- Budget Setup: validated budget, 1–20 people, and 1–30 days.
- Market Mode: purchase checks, price editing, purchased total, and remaining budget; market comparisons and price history are placeholders.

Hash navigation supports screen reloads and browser Back. Data stays in this browser under the `aikasya.v1` localStorage key. Clear Data restores the sample dataset and retains the selected language. The frontend connects to the local FastAPI backend; price estimates come from its seed data or user-entered prices. Ollama interpretation uses an on-device model when available and the backend local parser otherwise. There is no cloud account synchronization. Donation functionality is a placeholder.

## Offline and installation

The production build generates a web manifest and Workbox service worker. Interface files, fonts, official images, local food photos, and icons are cached. Settings opens the native installation prompt where supported, or shows browser-menu instructions.

## Structure

```text
src/App.tsx          Routing and state integration
src/components.tsx  Shared branded components and navigation
src/screens/        Individual screen components
src/i18n.ts         Typed English and Filipino dictionaries
src/state.ts        Local persistence and validation
src/data.ts         Sample data
src/pwa.ts          Native installation prompt
src/styles.css      Tailwind theme and reference-based styles
public/assets/      Official images and credited food photos
public/icons/       App icons from the official mascot
tests/              Browser interaction and responsive checks
tests/offline/      Production offline reload check
```

## Verification

```sh
npx playwright install chromium
npm test
npm run test:offline
```

Responsive tests cover 320, 390, 768, and 1440 pixel widths in both languages. Screenshots are written to the ignored `screenshots/` directory. The separate offline check builds the app and tests offline reload, saved grocery changes, locally cached images, and the manifest.

## Assets

Official originals were copied from the supplied `logo.png` and `mascot.png`. Backgrounds are retained and blended with CSS. Food photographs are credited in [public/assets/CREDITS.md](public/assets/CREDITS.md) and About AiKasya. Nunito is bundled locally.

`npm run assets:prepare` recreates app icons and redownloads food photos; it requires network access. Assets are already included, so this is not needed for normal development.

## Local backend integration

Run the backend and frontend in separate terminals from the repository root.

Backend (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd "front end"
npm install
npm run dev
```

The frontend calls `http://127.0.0.1:8000/api` by default. Set `VITE_API_BASE_URL` in a local `.env.local` file to change the backend address, then restart Vite. For a phone accessing another computer's backend, use that computer's reachable address; localhost refers to the phone itself. The backend must remain running for calculated plans and chat even when the internet is disconnected.

People controls recipe servings; Days divides the saved budget into a daily allowance. The backend currently returns alternatives for a single meal and does not build a complete multi-day menu. Chat uses an explicit budget from the message when provided. Selecting a chat result opens that exact recipe without regenerating it under different constraints.

Pantry edits save on the device. Use **Save pantry to backend** to synchronize the complete device pantry, or **Load backend pantry** to replace it with the backend stock. Quantities must use compatible units, such as `500 g`, `1 kg`, `250 ml`, or `3 pcs`; unknown ingredients, duplicate ingredients, and incompatible units require correction before saving. The planner uses the current device pantry and reports entries it cannot count.

After editing grocery costs, **Save prices to backend** stores valid entries as user-entered prices with the quantity and unit they cover. Invalid entries are skipped with a visible count. Backend meal selections add their calculated quantities and costs to the grocery list. Seed prices remain labeled as seed data; no live market feed is implied.

When the backend is unavailable, the planner explicitly labels its sample fallback, while chat reports the connection error instead of fabricating a reply. Backend errors do not clear device data.

`tests/backend.spec.ts` verifies the browser/API workflows with controlled responses; backend tests use isolated temporary databases to avoid modifying the checked-in demo database.
To run the real browser/backend smoke test with the backend already started (PowerShell, inside `front end`):

```powershell
$env:AIKASYA_LIVE_BACKEND = "1"
npx playwright test tests/live-backend.spec.ts
```

Ordinary browser tests use controlled API responses or explicitly simulate an unavailable backend, so they do not depend on a running service.