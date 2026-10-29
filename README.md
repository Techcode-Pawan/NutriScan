# NutriScan

**NutriScan: A Database-Driven Food Nutrition Analysis and Healthier Alternative Recommendation System** (thesis), presented as *"NutriScan: Explainable ML-Based Food-Label Analysis"*.

Scan a packaged food's barcode and NutriScan:

* looks it up in a PostgreSQL product database;
* rates it 0.5–5 stars with the **Indian Nutrition Rating (INR) from the FSSAI 2022 draft**, with a factor-by-factor explanation;
* recommends **higher-rated alternatives from the same category**, with the reason for each one;
* compares products side by side;
* answers questions through a **database-grounded assistant**;
* reads nutrition labels with **local OCR** when a product is missing;
* shows a separate, clearly labelled **experimental ML estimate** (Random Forest predicting the Open Food Facts Nutri-Score grade).

> NutriScan is an academic project. It is **not** an FSSAI-certified rating and does not give medical advice.

---

## Architecture

```
apps/mobile          Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router · React Query · expo-camera
        │  REST/JSON (EXPO_PUBLIC_API_URL)
services/api         Node.js · Express 5 · TypeScript · Zod · Prisma 6 · bcrypt · JWT · tesseract.js + sharp
        │  Prisma (pooled)          │ HTTP (optional)          │ HTTP (optional)
PostgreSQL 14+ (pg_trgm)      ml/inference (FastAPI)       LLM provider (Ollama / OpenAI-compatible / Claude)
        ▲
ETL: etl/fetch_off.py → services/api/src/scripts/etl.ts → import.ts      ML: ml/training (scikit-learn, SHAP)
```

| Folder | Contents |
|---|---|
| `services/api/src/modules/scoring` | INR engine (`inr.config.ts` holds the FSSAI tables as data; `inr.engine.ts` does the computation; `inr.explain.ts` builds the explanations) |
| `services/api/src/modules/*` | auth, products, recommendations, comparison, user data (history, favourites, preferences), submissions, ocr, ml, assistant |
| `services/api/src/etl` | barcode validation, numeric parsing, ingredient rules, category mapping, record normalisation |
| `services/api/prisma` | schema and SQL migrations |
| `apps/mobile/src/app` | 14 screens (Expo Router file routes) |
| `ml/` | dataset building, training, evaluation, SHAP inference service, tests |
| `etl/` | Open Food Facts snapshot fetch and ingredient enrichment (rate-limited, offline) |
| `data/` | `raw/` sources, `processed/` cleaned output and quality report, `import/` category mapping and sample dataset |
| `docs/` | audit, API, scoring, dataset, database, ML, OCR, testing, final report; `docs/thesis/` holds the thesis PDF and the presentation |
| `legacy/prototype/` | the original single-page prototype, kept for reference (not used by the app) |

## Features

| Area | What works |
|---|---|
| Barcode | Camera scanning (EAN-13/EAN-8/UPC-A/UPC-E), manual entry, and decoding a barcode from a photo. GS1 check-digit validation runs on the client and the server. |
| Product page | Nutrition per 100 g/ml with "not reported" shown for missing values, ingredients, descriptive ingredient notes, allergens named in the list, data source and licence, quality flags, completeness |
| INR rating | Exact FSSAI draft Schedule III tables for solids and liquids, positive-point caps, star bands, exempt categories, the beverage proviso, partial ratings, and the draft HFSS indicator |
| Alternatives | Same category only, strictly higher stars, reliable data only, preference and ingredient filters, a reason for each alternative, and trade-offs |
| Comparison | 2–4 products; differences are highlighted only when the measurement bases match; an evidence-based summary |
| Search | Name, brand or barcode search; category and subcategory filters; sort by rating, name or nutrient; pagination; trigram indexes |
| Accounts | Register, login, logout, log out everywhere, change password, delete account; guest mode |
| Personal data | Scan history, favourites, preferences (nutrient goals, vegetarian, excluded ingredients, optional age group) |
| Missing products | Submission form (guest or user) with optional photo, which is re-encoded to strip EXIF/GPS, plus a reviewer CLI |
| OCR | Image validation, sharp preprocessing, Tesseract, label parser with confidence flags, an editable review form, and analysis that is never stored |
| ML (experimental) | Random Forest predicting the Nutri-Score grade, grouped train/validation/test splits, SHAP explanations, a FastAPI service, and caching per model version |
| Assistant | Intent router, answers built from database facts, an ingredient glossary, a medical-question guard, optional LLM rephrasing with a numeric grounding check |

---

## Prerequisites

* **Node.js 22.13+ or 24 LTS** (Expo SDK 58 supports 22.13+, 24.3+ and 26+; it was developed here on Node 25 with an engine warning).
* **PostgreSQL 14+**: either a local install (its `bin` folder on PATH) or Docker.
* **Python 3.11** (only for the ML model and the Open Food Facts fetch scripts).
* For devices: **Expo Go**, or Android Studio with an emulator. A development build is needed for the camera on some devices.

## Quick start (new developer)

From the repository root:

```bash
# 1. Install dependencies
npm --prefix services/api install
npm --prefix apps/mobile install

# 2. Configure environment (then edit JWT_SECRET)
cp .env.example services/api/.env
echo "EXPO_PUBLIC_API_URL=http://localhost:4000" > apps/mobile/.env

# 3. Start PostgreSQL on localhost:5433 (choose one)
bash scripts/dev-db.sh                 # uses your local PostgreSQL binaries (Windows: scripts/dev-db.ps1)
# docker compose up -d db              # Docker alternative; then add the password to DATABASE_URL:
#                                      # postgresql://nutriscan:nutriscan@localhost:5433/nutriscan?schema=public

# 4. Create the schema (dev + test databases)
npm --prefix services/api run db:migrate
npm --prefix services/api run db:migrate:test
npm --prefix services/api exec prisma generate

# 5. Load products
npm --prefix services/api run etl            # cleans data/raw → data/processed (+ quality report)
npm --prefix services/api run data:import    # loads 4,542 products and computes INR scores
#   (or the 120-record sample: npm --prefix services/api run data:sample)

# 6. Run the API
npm --prefix services/api run dev            # http://localhost:4000/api/health

# 7. Run the app
npm --prefix apps/mobile run start           # press a (Android), i (iOS) or w (web)
```

Optional services:

```bash
# Experimental ML model (train once, then serve)
python -m venv .venv && .venv/Scripts/pip install -r ml/requirements.txt   # macOS/Linux: .venv/bin/pip
cd ml && ../.venv/Scripts/python -m training.train
../.venv/Scripts/python -m uvicorn inference.server:app --host 127.0.0.1 --port 8001

# Development login (credentials are written to services/api/.dev-credentials, which is git-ignored)
npm --prefix services/api run dev:user
```

### Running on a phone or emulator

The app needs the API address **as seen from the device**. Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` and restart Expo:

| Where the app runs | `EXPO_PUBLIC_API_URL` |
|---|---|
| Web browser / iOS simulator | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` (the emulator's alias for your computer) |
| Physical phone (same Wi-Fi) | `http://<your computer's LAN IP>:4000`, e.g. `http://192.168.1.20:4000`. Allow port 4000 through the firewall. |

`localhost` on a real phone refers to the phone itself, so it will not reach your computer.

## Environment variables

All variables are documented in [`.env.example`](.env.example). Required: `DATABASE_URL` and `JWT_SECRET` (32+ characters). Optional: `ML_SERVICE_URL`, `LLM_PROVIDER` / `LLM_MODEL` / `LLM_BASE_URL` / `LLM_API_KEY`, `OFF_LIVE_LOOKUP`, `OCR_LANG_PATH`, `CORS_ORIGINS`, `TRUST_PROXY`. The mobile app reads only `EXPO_PUBLIC_API_URL`, and no secrets are bundled into it.

### AI assistant providers (all optional)

| `LLM_PROVIDER` | Cost | Notes |
|---|---|---|
| `none` (default) | free | Deterministic answers from database facts and templates; works offline |
| `ollama` | free, local | `ollama pull llama3.2`; set `LLM_MODEL`, and `LLM_BASE_URL` if not the default |
| `openai_compatible` | depends on provider | Any `/chat/completions` endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) |
| `anthropic` | paid | Claude via the official SDK (default model `claude-opus-5-5`, low effort, server-side refusal fallback enabled) |

The LLM only rephrases a verified draft answer. Any answer containing a number that is not in the facts is discarded and replaced by the verified answer. Medical questions never reach the LLM.

## Data

* **Open Food Facts**: a controlled snapshot of 4,067 India-tagged products with completed nutrition facts, taken 2026-10-29 (`etl/fetch_off.py`, rate-limited). Licensed **ODbL 1.0 / DbCL** (images CC BY-SA); the app shows attribution. Refresh it with `python etl/fetch_off.py`, resume ingredient enrichment with `python etl/enrich_off_ingredients.py <snapshot>`, then re-run `etl` and `data:import`.
* **Legacy CSV** from the prototype: 852 student-collected rows, **without barcodes** and with unrecorded provenance, imported as searchable, unverified records.
* The quality report is in [`data/processed/quality_report.md`](data/processed/quality_report.md). See [`docs/DATASET.md`](docs/DATASET.md).

## Tests

```bash
npm --prefix services/api test                       # 187 unit + integration tests (uses nutriscan_test)
RUN_OCR_TESTS=1 npm --prefix services/api test       # + 2 real Tesseract OCR tests (downloads ~10 MB once)
cd ml && ../.venv/Scripts/python -m pytest -q        # 10 ML tests
npm --prefix apps/mobile test                        # 20 mobile component/screen tests
npm --prefix services/api run typecheck && npm --prefix apps/mobile run typecheck
```

See [`docs/TESTING.md`](docs/TESTING.md).

## API

Base URL `http://localhost:4000/api`. Full reference: [`docs/API.md`](docs/API.md) (OpenAPI: [`docs/openapi.yaml`](docs/openapi.yaml)).

`GET /products/:barcode` · `GET /products/search?q=` · `GET /products/:barcode/alternatives` · `GET /categories` · `GET /categories/:id/products` · `POST /compare` · `POST /auth/register` · `POST /auth/login` · `GET|POST|DELETE /history` · `GET|POST /favorites` · `DELETE /favorites/:barcode` · `GET|PUT /preferences` · `POST /submissions` · `POST /ocr/label` · `POST /ocr/analyze` · `GET /products/:barcode/ml` · `POST /assistant/ask` · `GET /health`

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot connect to PostgreSQL` on API start | Start the database (`bash scripts/dev-db.sh` or `docker compose up -d db`) and check `DATABASE_URL`. |
| App shows "Cannot reach NutriScan" | `EXPO_PUBLIC_API_URL` is wrong for your device (see the table above), the API isn't running, or a firewall is blocking port 4000. Restart Expo after editing `.env`. |
| ML screen says "unavailable" | Train the model and start the inference service (see Optional services). Everything else still works. |
| OCR returns `OCR_UNAVAILABLE` | The first OCR run downloads `eng.traineddata`. When offline, put it in a folder and set `OCR_LANG_PATH`. |
| `prisma migrate` hangs | Another Prisma process holds the migration lock. Stop it, or run `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory';`. |
| Camera never starts in Expo Go | Grant the permission in system settings, or use manual entry or a barcode photo. Some devices need a development build (`npx expo run:android`). |
| Expo engine warning on Node 25 | Use Node 22.13+ or 24 LTS. |

## Licence and attribution

Product data © Open Food Facts contributors, ODbL 1.0. The INR methodology follows the FSSAI draft notification of 13 September 2022 (`docs/reference/FSSAI_Draft_INR_2022.pdf`). Any redistribution of a derived database must follow ODbL share-alike terms.
