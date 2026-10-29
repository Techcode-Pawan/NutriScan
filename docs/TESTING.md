# Testing

| Suite | Command | Tests | Result (2026-10-29) |
|---|---|---|---|
| API unit: INR engine, ETL, OCR parser, assistant guards | `npm --prefix services/api run test:unit` | 143 | all passed |
| API integration (Supertest + `nutriscan_test` database) | `npm --prefix services/api run test:integration` | 44 | all passed |
| Real OCR (opt-in) | `RUN_OCR_TESTS=1 npm --prefix services/api test` | +2 | all passed |
| ML (pytest) | `cd ml && ../.venv/Scripts/python -m pytest -q` | 10 | all passed |
| Mobile (jest-expo + React Native Testing Library 14) | `npm --prefix apps/mobile test` | 20 | all passed |
| Type checks | `npm --prefix services/api run typecheck`, `npm --prefix apps/mobile run typecheck` | – | no errors |

The full API run with OCR enabled: 5 files, **189 tests passed**.

## What is covered

**INR scoring** (`tests/unit/inr.engine.test.ts`): an independent transcription of every FSSAI table; both sides of every threshold; every star-band edge (solid and liquid); the thesis worked example; a real CSV row; cap switching at 20/21 (solid) and the liquid caps; negative and extreme scores; float noise; each missing core nutrient; partial ratings; undeclared FV/NLM; exempt, unmapped and unknown-basis products; the beverage proviso; explanations; the HFSS criteria.

**ETL** (`etl.test.ts`): GS1 validation and UPC-A conversion; numeric parsing (`<1`, `7,65`, invalid); legacy basis assumed / inferred / unknown; missing values stay null; plausibility rejection; liquids per 100 ml; OFF kJ→kcal and salt→sodium; invalid barcodes rejected; the suspected per-serving guard; category-rule priority and name fallback; plain vs masala oats; FV/NLM parsing (excluding potato); vegetarian evidence; ingredient insights and allergens.

**OCR parser and assistant** (`nutrition-parser.test.ts`): kJ/kcal, total vs added sugars, fat/saturated/trans, OCR character fixes, salt→sodium, basis and multi-column warnings, impossible-value flags, ingredient extraction; intent routing (including medical questions); rejection of ungrounded LLM numbers.

**API integration** (`tests/integration/api.test.ts`): health; categories and counts; threshold rows seeded; hand-computed ratings for 6 fixtures; nutrition and missing fields; invalid vs unknown barcode (400 vs 404 with `canSubmit`); id lookup for barcode-less products; search, brand, wildcard escaping, sorting, pagination and validation; alternatives (order, strictly higher, partial exclusion and inclusion, the honest empty result, vegetarian and excluded-ingredient filters, preferences not changing the rating); comparison (evidence summary, different bases not highlighted, validation); bcrypt storage, duplicate email, weak password, login with an equal error for unknown users, protected routes, cross-user isolation (another user's history entry → 404), logout-all revocation; favourites, preferences, history clear, account deletion cascade; submissions (pending, not added to products, validation, plausibility); OCR analyze (thesis example values → 3★) and implausibility; ML reported unavailable; assistant (verified answer, nutrient comparison, medical refusal); **an end-to-end flow**: barcode lookup → nutrition → INR → alternatives → compare → history.

**ML** (`ml/tests/test_ml.py`): missing values stay NaN; labelled-set filtering; duplicate grouping and no group overlap; imputer fitted on training rows only; ML index; SHAP feature mapping; metric computation; reproducible training above baseline; predictor output (probabilities, range, SHAP); missing model error; the shipped model's inference and sanity check.

**Mobile** (`apps/mobile/__tests__`): barcode, nutrition-form and auth validation logic; StarRating accessibility labels and partial/unrated states; NutritionTable "not reported"; error states (network, database) with retry; scanner permission requested and permanently denied; manual entry validation and navigation; product details (rating, explanation, breakdown, HFSS, source); navigation to alternatives; the not-found state with a submission path; retry on network failure.

## Isolation

* API tests force `DATABASE_URL` to `nutriscan_test` (`tests/setup-env.ts`). `resetDatabase()` refuses to truncate any database whose name doesn't contain `nutriscan_test`.
* Fixtures use GS1 restricted-circulation barcodes (`200…`), never real products.
* No real user data is used. Rate limiters are disabled under `NODE_ENV=test`.
* The ML service URL points to an unused port, so the "unavailable" path is exercised. The LLM provider is `none`.

## Manual verification performed

With the API, ML service and Expo web running against the full database, these flows were exercised in a browser at phone size: welcome → guest → scanner (camera-permission state) → manual entry (invalid check digit rejected, valid barcode → product page) → product details → alternatives → unknown barcode (not-found screen with submission) → registration → history persisted → search → ML screen → assistant.

Not tested: a physical Android/iOS device, the camera barcode decoder on a real pack, and `scanFromURLAsync` on native. These need a device or emulator, which were not available in this environment.
