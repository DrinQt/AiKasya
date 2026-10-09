# AiKasya

AiKasya's repository keeps frontend and backend work separate.

- `front end/` contains the React, TypeScript, and Vite app, its assets, configuration, and browser tests.
- Backend teammates can add their service in a separate top-level folder such as `backend/`.

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