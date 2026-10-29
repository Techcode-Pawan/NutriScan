# NutriScan: final implementation report (2026-10-29)

## A. Architecture implemented

Three tiers, as in thesis Fig. 4.1:

* **Expo SDK 58 / React Native 0.88 app** (TypeScript, Expo Router, React Query, expo-camera, expo-secure-store)
* **Express 5 + TypeScript API** (Zod validation, Prisma 6, JWT, bcrypt, helmet, CORS allow-list, rate limits)
* **PostgreSQL** with `pg_trgm`

Optional components:

* a **Python FastAPI inference service** (scikit-learn Random Forest + SHAP);
* local **Tesseract OCR** inside the API;
* a pluggable **LLM provider**: none (default), Ollama, OpenAI-compatible, or Claude.

Offline ETL: Python fetchers for Open Food Facts, then the TypeScript normaliser and importer, which the optional live lookup shares.

## B. Prototype components reused

* The emerald visual direction and card layout.
* The ideas behind `build_data.py`: `<x` and decimal-comma parsing, sweetener detection (now a rule in ingredient insights), and FV percentage parsing (rewritten with word-boundary matching and NLM support).
* The 852-row CSV, imported as unverified, barcode-less records.
* The INR *concept* of the scoring function.

The prototype itself is kept unchanged in `legacy/prototype/`. **Not reused:**

* its JavaScript thresholds and bands, which were wrong (see `docs/SCORING.md`);
* the 394 synthetic "Series #N" products;
* the fake fallbacks: random product on decode failure, first product for unknown barcodes.

## C. New features

* Database-backed barcode lookup with GS1 validation.
* Exact FSSAI-draft INR with explanations and the draft HFSS indicator.
* Same-category, strictly-higher-rated alternatives with reasons and trade-offs.
* Comparison of 2–4 products.
* Search with category, sort and pagination.
* Auth (register, login, logout, logout-all, password change, account deletion) and guest mode.
* History, favourites and preferences (nutrient goals, vegetarian, ingredient exclusions, optional age group).
* Missing-product submissions with EXIF stripping, plus a reviewer CLI.
* The OCR pipeline with an editable review form.
* The experimental ML estimate with SHAP.
* A database-grounded assistant with deterministic fallback and a numeric grounding guard.
* 14 mobile screens.
* API, OpenAPI and project docs.

## D. Database

Prisma schema with 15 tables (thesis Appendix A plus provenance, scoring-algorithm versions, ML model and prediction tables, and assistant metadata). One migration `20261029000000_init` with trigram indexes and CHECK constraints. It was applied to the `nutriscan` and `nutriscan_test` databases. See `docs/DATABASE.md`.

## E. Dataset import

| Step | Count |
|---|---|
| Raw records (OFF snapshot 4,067 + CSV 852) | 4,919 |
| Rejected: invalid barcode 102, duplicates 8, implausible 149, no name 118 | 377 |
| **Imported** (3,730 OFF with barcodes + 812 CSV without) | **4,542** |
| With an INR star rating (RATED 1,540 + PARTIAL 558) | 2,098 |
| Exempt / not eligible / insufficient data / basis unknown | 834 / 847 / 599 / 164 |

Commands: `python etl/fetch_off.py`, `python etl/enrich_off_ingredients.py <snapshot>`, `npm run etl`, `npm run data:import`. Import time was about 95 s with 0 failed records. The report is in `data/processed/quality_report.md`.

**Limitation:** ingredient enrichment for OFF products stopped at 534 of 4,067 because OFF throttled the per-product API (HTTP 429). It is resumable, and products without ingredient text show "No ingredient list".

## F. INR scoring

Implemented from Schedule III Tables 1–6, with 7 documented assumptions for gaps in the draft (overlapping liquid bands, the FV step gap, dairy beverages, the beverage proviso, declared-only FV/NLM, the category mapping, and rounding). **92 unit tests pass**, covering both sides of every threshold and every band edge.

## G. ML

* **Target:** the OFF Nutri-Score grade (A–E), a published reference label. No labels were fabricated.
* **Model:** Random Forest (depth 12, 300 trees, `max_features` 0.5, balanced class weights) on 1,453 labelled products, with a grouped split of 1,037 train / 208 validation / 208 test.
* **Test results:** accuracy **0.721**, macro-F1 **0.674**, within one grade **0.957**, against a majority-class baseline of 0.399 / 0.114.
* **Grouped 7-fold CV:** accuracy 0.746 ± 0.046, macro-F1 0.690 ± 0.046.
* SHAP explanations per prediction.

The model is explicitly not a validation of INR and says nothing about medical validity.

## H. OCR

tesseract.js with sharp preprocessing, a line-based label parser with confidence flags, mandatory user review, and analysis that is never stored. A real OCR run on the sample label extracted all 9 fields correctly at 91% engine confidence.

**Limitations:** English only; tested on a clean rendered label, not real phone photos; line-based parsing, so per-serving columns need user confirmation.

## I. Assistant

The assistant classifies the question's intent, builds facts from the database and the deterministic services, and answers with fixed templates by default (`LLM_PROVIDER=none`). When an LLM is configured, it only rephrases a verified draft. Answers containing numbers that are not in the facts are rejected in favour of the verified answer. Medical questions always get a fixed cautious answer. Provider errors fall back silently, with a note. Only the intent and provider are logged.

## J. API endpoints

All thesis Table 4.10 endpoints, plus `/products/:barcode/explanation`, `/products/:barcode/ml`, `/ml/status`, `/ml/predict`, `/ocr/label`, `/ocr/analyze`, `/assistant/ask|status|suggestions`, `/auth/logout|logout-all`, `/me` (GET, PATCH, DELETE, password), `/submissions/mine`, `/categories`, `/health`, `/scoring/methodology` and `/attribution`. See `docs/API.md` and `docs/openapi.yaml`.

## K. Automated tests actually executed

| Suite | Result |
|---|---|
| API unit (INR, ETL, OCR parser, assistant guards) | 143 / 143 passed |
| API integration (Supertest, isolated test DB, includes the end-to-end flow) | 44 / 44 passed |
| Real OCR (opt-in) | 2 / 2 passed |
| ML pytest | 10 / 10 passed |
| Mobile jest-expo + RNTL | 20 / 20 passed |
| TypeScript (`tsc --noEmit`, API and mobile) | 0 errors |

The app was also checked manually in a browser at phone size (Expo web) against the live API: guest flow, scanner states, manual lookup, product page, alternatives, not-found, registration, persisted history, search, ML, assistant.

## L. Remaining limitations

* **Not run on a physical phone or emulator** in this environment. Camera scanning and native photo decoding are implemented with the documented expo-camera APIs and typecheck, but have not been exercised on a device.
* Data quality depends on Open Food Facts (crowd-sourced; some values are visibly wrong, for example sodium 0 mg) and on the unverified CSV. 743 products have no mapped category and are not rated.
* OFF ingredient text is available for only part of the catalogue (see E).
* Category-to-INR-class mapping is an approximation, because FSS Appendix A codes are not in the data.
* OCR quality on real photos is unmeasured; English only.
* The ML model's middle grade (C) is weak (F1 0.37).
* The LLM providers were not exercised against live services. Only the deterministic mode and the guard logic are tested. The Anthropic provider uses the official SDK and requires a paid API key.
* There is no admin web UI for submission review; it is a CLI.
* Developed on Node 25, which is outside Expo 58's supported range (22.13/24/26); use Node 24 LTS.

## M. Commands

See README "Quick start". In short:

```bash
npm --prefix services/api install && npm --prefix apps/mobile install
cp .env.example services/api/.env   # set JWT_SECRET
bash scripts/dev-db.sh              # or docker compose up -d db
npm --prefix services/api run db:migrate && npm --prefix services/api run db:migrate:test
npm --prefix services/api run etl && npm --prefix services/api run data:import
npm --prefix services/api run dev
npm --prefix apps/mobile run start
```

## N. Environment variables

Required: `DATABASE_URL`, `JWT_SECRET`. For tests: `TEST_DATABASE_URL`. Mobile: `EXPO_PUBLIC_API_URL`. Optional: `ML_SERVICE_URL`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `OFF_LIVE_LOOKUP`, `OFF_USER_AGENT`, `OCR_LANG_PATH`, `CORS_ORIGINS`, `TRUST_PROXY`, `JWT_EXPIRES_IN`. See `.env.example`.

## O. Development login

A development account `demo@nutriscan.local` was created with `npm run dev:user`. Its randomly generated password is in `services/api/.dev-credentials` (git-ignored). Re-running the command resets it.

## P. Important files

* `services/api/src/modules/scoring/inr.config.ts`, `inr.engine.ts`, `inr.explain.ts`: scoring
* `services/api/src/modules/recommendations/recommendation.service.ts`: alternatives
* `services/api/src/etl/*`, `src/scripts/etl.ts`, `src/scripts/import.ts`, `data/import/category_mapping.json`: data pipeline
* `services/api/prisma/schema.prisma` and its migration
* `ml/training/train.py`, `ml/inference/server.py`, `ml/artifacts/evaluation_report.md`
* `apps/mobile/src/app/*`: screens
* `docs/PROJECT_AUDIT.md`, `SCORING.md`, `DATASET.md`, `DATABASE.md`, `ML.md`, `OCR.md`, `API.md`, `TESTING.md`

## Q. Acceptance criteria

Legend: ✅ implemented and tested · 🟡 implemented, partially verified · ❌ not done

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Mobile app launches | 🟡 | Launched and used on **Expo web** at phone size against the live API. Not launched on an Android/iOS device or emulator here. |
| 2 | Backend starts | ✅ | `npm run dev` → `/api/health` ok |
| 3 | PostgreSQL connects | ✅ | Health `database: ok`; integration tests |
| 4 | Prisma migrations work | ✅ | `migrate deploy` applied to the dev and test DBs |
| 5 | Valid products imported | ✅ | 4,542 imported, 0 failed |
| 6 | Barcode lookup returns real DB records | ✅ | Integration tests; manual lookup of 8901719100956 |
| 7 | Missing products handled honestly | ✅ | 404 `PRODUCT_NOT_FOUND` + submission path (API and mobile tests) |
| 8 | Nutrition facts display correctly | ✅ | Product screen test; "not reported" for missing values |
| 9 | INR matches the methodology | ✅ | Table transcription tests; thesis example; hand-computed fixtures |
| 10 | Scoring boundaries tested | ✅ | 92 INR tests |
| 11 | Product search works | ✅ | Integration tests and manual check |
| 12 | Category filtering works | ✅ | `/categories/:id/products` test |
| 13 | Alternatives come from DB queries | ✅ | Integration tests (order, filters, empty result) |
| 14 | Comparisons use consistent units | ✅ | Different-basis comparison not highlighted (test) |
| 15 | Registration and login | ✅ | Integration tests; registration done in the UI |
| 16 | Preferences persist | ✅ | Integration test |
| 17 | Favourites persist | ✅ | Integration test |
| 18 | Scan history persists | ✅ | Integration test; verified in the UI |
| 19 | OCR works or has a documented path | ✅ | Real Tesseract test (opt-in) and 12 parser tests; limitations documented |
| 20 | ML trained and evaluated honestly | ✅ | Metrics computed by the script; reproducibility test |
| 21 | AI explanations use verified facts | ✅ | Deterministic answers from the DB; grounding guard test |
| 22 | Works without paid AI | ✅ | Default `LLM_PROVIDER=none`; all tests run without an LLM |
| 23 | Errors handled properly | ✅ | 400/401/404/409/413/415/422/429/503 paths; mobile error-state tests |
| 24 | Critical automated tests pass | ✅ | 189 + 10 + 20 passing |
| 25 | Docs allow reproduction | 🟡 | README, `.env.example` and scripts written and the commands run here. A from-scratch setup on a second machine was not performed. |
