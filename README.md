# AIKasya - Bawat Piso. May Plano!
- an offline-first meal planning and budget optimization app powered by Local AI, designed for Filipinos, especially those with irregular or fluctuating daily income. Users enter their budget, household size, number of days, pantry ingredients, and food allergies. AIKasya then plans affordable Filipino meals, builds daily breakfast, lunch, and dinner schedules, and creates shopping lists that never go over budget. Prices come from official PSA, DA, and DTI data, with clearly labeled estimates where official data is missing, and users can enter their own prices. An on-device AI model understands requests in English, Filipino, or Taglish, while every peso is calculated exactly in code. This makes everyday food planning practical, accessible, and budget-friendly, even without an internet connection.
  

## Team Members:
1. Buñag, Roswell
2. Kalaw, James Andre
3. Ramos, Monnic Chelica Miles 
4. Reyes, Aldrin Paul

AiKasya's repository keeps frontend and backend work separate.

- `front end/` contains the React, TypeScript, and Vite app, its assets, configuration, and browser tests.
- `backend/` contains the FastAPI service, local AI interpreter, optimizer, and SQLite data.

## Run the frontend

```sh
cd "front end"
npm install
npm run dev
```

## Run the backend & Local AI

```sh
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Interactive API Docs: http://127.0.0.1:8000/docs

## Verify the project

### Frontend (inside `front end`):
```sh
npm run build
npm test
```

### Backend:
```sh
pytest -v
```

See [the frontend README](front%20end/README.md) and [the backend README](backend/README.md) for full architecture details.
## Connected frontend and backend

The frontend now calls the local backend for chat interpretation, budget-constrained meal options, recipe details, pantry synchronization, and user-entered prices. Start the backend on port 8000 and the frontend on port 5173 in separate terminals; see [the frontend integration instructions](front%20end/README.md#local-backend-integration).

The planner divides the saved budget by Days and requests single-meal alternatives for the selected People count. Sample plans are explicitly labeled when the backend is unavailable. Pantry and price synchronization use the visible save/load controls; there are no cloud AI calls in this integration.
## Start both services together

After installing frontend packages and backend requirements, run `npm.cmd run dev` from the repository root or from `front end`. This starts the local backend before Vite and reuses the backend if it is already running. Stop the combined command with Ctrl+C. For frontend-only development, run `npm.cmd run dev:frontend` inside `front end`.
