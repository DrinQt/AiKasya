# AiKasya

Offline-first food budgeting and meal planning frontend built with React, Vite, TypeScript, and Tailwind CSS. The supplied mockup guides the cream backgrounds, forest green buttons, pale green cards, yellow accents, spacing, and navigation. Official logo and basket mascot images are included locally, unchanged.

## Run

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
- AI Chat: saved messages and deterministic sample replies; no model or network calls.
- Meal Planner: sample Adobo/Monggo meals across the chosen days, with estimates scaled by household size.
- Grocery List: saved checkboxes, editable prices, and calculated totals.
- My Pantry: add and remove ingredients, including quantities.
- Insights: checked grocery spending and budget proportions; weekly bars are labeled sample data.
- More / Settings: saved English/Filipino preference, budget shortcut, installation action, information, tips, and confirmed data reset.
- Recipe Details: sample ingredients and a placeholder for detailed instructions.
- Budget Setup: validated budget, 1–20 people, and 1–30 days.
- Market Mode: purchase checks, price editing, purchased total, and remaining budget; market comparisons and price history are placeholders.

Hash navigation supports screen reloads and browser Back. Data stays in this browser under the `aikasya.v1` localStorage key. Clear Data restores the sample dataset and retains the selected language. Meal costs are illustrative; no live prices, backend, account synchronization, or local AI are implemented. Donation functionality is a placeholder.

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
