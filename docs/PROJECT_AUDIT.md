# NutriScan — Project Audit

Audit of the three supplied artefacts, written before implementation:

* `NutriScan_Thesis.pdf`: the Phase-I report *"NutriScan: A Database-Driven Food Nutrition Analysis and Healthier Alternative Recommendation System"* (45 pages).
* `PPT NutriScanAI Final.pptx`: the presentation *"NutriScan: Explainable ML-Based Food-Label Analysis"* (14 slides).
* `NutriScan-main.zip`: the prototype (`index.html`, `build_data.py`, `data.json`, `packaged_foods_india-Ieivcg.csv`).

The prototype files are preserved unchanged in `legacy/prototype/`, and the CSV is kept as `data/raw/packaged_foods_india.csv`.

---

## 1. Existing architecture

The prototype is a **single static HTML page**. There is no backend, database, authentication or persistence.

| Part | What it is |
|---|---|
| `index.html` (62 KB) | Tailwind via CDN, Lucide icons, `html5-qrcode` for camera and image barcode decoding. All logic lives in one inline `<script>`. |
| `SAMPLE_DATABASE` (inside `index.html`) | 6 hand-written products, plus **394 synthetic products generated in a loop** (`"${brand} ${cat} Series #${i}"`, with nutrients from modular arithmetic and fake barcodes `89010000xxxx`). |
| `calculateFssaiInrScore()` | A JavaScript INR-style scorer (see §4). |
| `build_data.py` | Converts the CSV into `data.json`. **`index.html` never loads `data.json`**, so the real dataset was never connected to the UI. |
| `packaged_foods_india-Ieivcg.csv` | 852 rows of Indian packaged foods (see §5). |

## 2. Existing working features

* A responsive landing and scan page with good visual styling. The emerald palette and card layout are reused as the mobile design direction.
* Camera barcode decoding through `html5-qrcode` works in a browser, but only as decoding.
* Image upload decoding, which has a fake fallback (see §4).
* Name and brand search, a category filter and rating sort, all over the in-memory synthetic list.
* A star-rendering widget and a score-breakdown table layout.
* `build_data.py`: useful ideas worth keeping, namely numeric cleaning (`<1`, decimal commas), sweetener detection and fruit/vegetable percentage parsing from ingredient text.

## 3. Incomplete features (relative to thesis and presentation)

| Feature | Thesis | PPT | Prototype status |
|---|---|---|---|
| PostgreSQL database and ETL | Required (Ch. 3, App. A) | — | **Missing** |
| Node/Express REST API (Table 4.10) | Required | — | **Missing** |
| React Native (Expo) app | Required (Obj. 1) | Required | **Missing** (web page only) |
| Barcode → real product lookup | FR1–FR3 | Yes | **Missing**: lookup is against synthetic data, and unknown barcodes silently show product #1 |
| INR scoring per FSSAI draft | FR4, §4.7 | — | **Incorrect** (see §4) |
| Explanation, positives and concerns | FR5 | Yes | Partial: point table only |
| Healthier alternatives | FR6, §4.8 | Yes | **Missing** |
| Product comparison | FR7, §4.9 | — | **Missing** |
| Search and category browsing | FR8 | — | Partial (synthetic, in-memory) |
| Auth, history, favourites, preferences | FR9 | Personalisation | **Missing** |
| Incomplete-data handling | FR10 | — | **Missing**: `|| 0` turns missing values into zero |
| Missing-product submission | FR11 | — | **Missing** |
| OCR of nutrition labels | — | Phase 2 | **Missing** |
| ML (Random Forest) health score | Explicitly *not used* | Core claim | **Missing** |
| AI product Q&A assistant | — | Deliverable 5 | **Missing** |
| Age-based recommendations | — | Slide 9 | **Missing** |

## 4. Broken or risky implementation areas

1. **Unit bug in energy points.** The energy thresholds (335, 670, …, 3350) are **kJ** steps (taken from the Australian Health Star Rating), but product energy is stored in **kcal**. A 480 kcal biscuit (≈2008 kJ) therefore scores 1 point instead of 5. The FSSAI draft uses **kcal** thresholds (80, 160, …, 800).
2. **Wrong threshold tables.** Saturated fat, sugar and sodium stop at 10 points. The draft goes to 25 / 20 / 25 points, and its sugar steps are 4.2 g, not 4.5 g.
3. **Wrong positive-point tables.** Fibre and protein steps do not match the draft. There are no NLM (nuts, legumes, millets) points, and the FV table (`≤40 → 0 … >80 → 5`) is invented.
4. **No positive-point caps.** The draft's Table 4 caps (baseline ≤20 versus >20 for solids; ≤10 versus >10 for liquids) are missing.
5. **Wrong star bands.** The prototype maps `≤ −5 → 5★` and `≤ 2 → 4★`. Thesis Table 4.7 and draft Table 6 give `≤ −11 → 5★`, `−6…−2 → 4★` and `−1…2 → 3.5★`. There is also no liquid-food scale.
6. **No solid/liquid/exempt distinction.** Juices are scored with the solid tables, and exempt categories (Schedule IV) are rated anyway.
7. **Missing values become zero.** `product.energy || 0` and similar rate an incomplete product as if it were healthy.
8. **Fabricated results.** `processProductBarcode` falls back to `SAMPLE_DATABASE[0]` for unknown barcodes, and a failed image decode shows a **random** product. Both contradict FR3.
9. **Synthetic data shown as real.** The explore grid lists the 394 generated "Series #N" products beside the 6 hand-written ones, with no label.
10. **XSS risk.** Search results are interpolated into `innerHTML` without escaping.
11. **Unpinned CDN scripts** (`lucide@latest`, `html5-qrcode` with no version).
12. **`build_data.py` heuristics.** It rescales per-serving values to per-100 g whenever macros fit inside the serving. That can mis-scale low-macro per-100 g products such as juices. It also sets missing fibre to 0 and drops rows missing protein.

## 5. Dataset limitations

### 5.1 `packaged_foods_india.csv` (852 rows, student-collected)

* **No barcode column.** These products cannot be found by scanning. They are imported as searchable, browsable records keyed by `legacy-csv:<S.No>`. **No barcodes are invented.**
* **Provenance mostly unknown.** `Source_of_Data` is empty for 850 rows (two say ZEPTO/BLINKIT, which are quick-commerce listings). `Collection_Date` is empty for 849 rows and `Collected_By` for all rows. The records are therefore **unverified**.
* **Measurement basis not stated.** `Serving_Size_g` is `100` for 780 rows, so those are *assumed* to be per 100 g/ml and the assumption is recorded. For the other 72 rows the basis is inferred only when it is unambiguous: if carbohydrate + protein + fat exceeds the serving mass, the values cannot be per-serving. Otherwise the basis is stored as `UNKNOWN` and **no INR rating is computed**.
* **Fibre is 0 in 600/852 rows.** Indian labels were not required to declare fibre, so many zeros are probably "not declared". The value is kept as supplied but flagged `fibre_zero_unverified`. This does not change the rating, since ≤3 g already scores 0 positive points.
* **Non-numeric entries.** Values like `<1`, `<0.05`, `<650` are stored at the upper bound and flagged `less_than_value`. Decimal commas (`7,65`) are parsed. The malformed `5.928.8` is stored as missing.
* **Duplicates and typos.** 9 duplicate name+brand pairs exist, and the category typo `ICEREAMES` is mapped to Ice cream.
* **Liquids.** Juices are labelled `g` although they are liquids, so the basis is recorded as per 100 ml (assumed).

### 5.2 Open Food Facts (OFF)

* This is the thesis's intended source. It is crowd-sourced, so completeness and accuracy vary.
* The licence is ODbL 1.0 (database), DbCL (contents) and CC BY-SA (images). Attribution and share-alike apply to derived databases.
* A **controlled, rate-limited snapshot** of India-tagged products with completed nutrition facts is fetched by `etl/fetch_off.py`. It is never fetched at application start-up.
* OFF products have real barcodes, which are validated with GS1 check digits. Invalid codes are rejected.
* OFF supplies a computed **Nutri-Score grade**. That grade is an independent reference label used as the ML target (§6.2).

## 6. Conflicts between the thesis and the presentation

| Topic | Thesis | Presentation | Resolution |
|---|---|---|---|
| Scoring | Rule-based INR, "No machine-learning model is used" | "ML model … predicts the final Health Score (0–100)" via Random Forest | **Two separate systems.** INR is the primary rating. A clearly labelled *experimental* ML estimate is secondary. They are stored in separate tables (`health_scores`, `ml_predictions`) and never merged into one number. |
| Score scale | 0.5–5 stars (INR). §4.6's 0–100 score is superseded. | 0–100 | INR stars are official. The ML output is presented as a *predicted Nutri-Score grade* with a derived 0–100 index, labelled experimental. |
| Live third-party lookup | "never queries third-party sources at scan time" | not stated | Off by default (`OFF_LIVE_LOOKUP=false`). It can be enabled as an explicit backend option, and results are stored with OFF provenance. |
| ML target | n/a | "Map … to its corresponding health score from the ML dataset" | No dataset has ground-truth "health scores". Labels are **not fabricated**. The model predicts OFF's Nutri-Score grade, a published, independently defined reference (§ML in `docs/ML.md`). |
| Personalisation | Preference filtering of alternatives | Personalised score, age-based recommendations | Preferences re-rank and filter alternatives and add context. They **never change the INR rating**. Age group only adds general guidance text, with no medical claims. |
| Health score schema | `health_scores.score` 0–100, `band`, `confidence` | — | Adapted: star rating, final score, baseline and positive points, status (`RATED`/`PARTIAL`/`INSUFFICIENT_DATA`/`EXEMPT`/`NOT_ELIGIBLE`/`BASIS_UNKNOWN`), explanation (JSON), algorithm version. |
| `products.barcode` as primary key | Yes | — | Changed to a surrogate `id` with a **unique nullable barcode**, because legacy CSV products have no barcodes. Barcode lookups still use a unique index. |

### 6.1 Thesis gap: INR tables not reproduced

Thesis §4.7 gives only the solid-food star scale and an illustrative example. It explicitly refers to the FSSAI draft notification [18] for "the complete proposed INR tables, eligibility requirements, nutrient thresholds, point caps and rating rules". That document (FSSAI F. No. Std./SP-08/T(FoPNL-N-01), 13 Sept 2022, Schedule III Tables 1–6 and Schedule IV) was retrieved from the URL cited in the thesis and saved as `docs/reference/FSSAI_Draft_INR_2022.pdf`. The scoring engine transcribes those tables exactly, in `services/api/src/modules/scoring/inr.config.ts`.

### 6.2 Ambiguities in the source tables (isolated in configuration)

1. **Liquid star bands overlap.** The draft lists `1.5★ = 16–18`, `1★ = 18–20` and `0.5★ = ≥20`. Resolved first-match from the best band down: 18 → 1.5★, 19–20 → 1★, ≥21 → 0.5★.
2. **FV/NLM step gap.** Row 9 is `>50` (solids) or `>45` (liquids), and row 10 is `>55`, skipping one step. Transcribed exactly as printed.
3. **Dairy beverages** (milkshakes, flavoured milk) belong to Category I ("Solid foods, incl. dairy products and beverages"), so they are scored with solid tables. Their per-100 ml values are treated as per-100 g, and this is flagged.
4. **"Beverage without energy and/or sugar"** is read as declared energy = 0 *or* declared total sugars = 0, which makes it not eligible.
5. **Food-category codes.** The draft uses FSS Appendix-A category numbers, which neither dataset carries. Mapping dataset categories to Category I / II / III is a documented lookup table (`data/import/category_mapping.json`). Unmappable products are **not rated** and are excluded from alternatives.
6. **FV/NLM percentages** are counted only when declared in the ingredient list (the draft requires them to be declared when present). If none are declared, 0 positive points are awarded and the explanation says so.
7. **Starchy tubers** (potato, cassava) are not counted as vegetables for FV points. This is a conservative assumption and is documented.

## 7. Final architecture

```
apps/mobile         Expo (React Native, TypeScript, Expo Router, React Query, expo-camera)
services/api        Express 5 + TypeScript + Zod + Prisma 6 → PostgreSQL
  modules/          auth, products, scoring (INR), recommendations, comparison, history,
                    favorites, preferences, submissions, ocr (tesseract.js + sharp),
                    ml (client to Python service), assistant (deterministic + optional LLM)
  etl/              TypeScript normalisation shared by batch import and optional live OFF lookup
ml/                 Python: dataset prep, Random Forest training/evaluation, SHAP, FastAPI inference
etl/fetch_off.py    Rate-limited OFF snapshot fetcher
data/raw|processed|import
docs/
```

The three tiers follow thesis Fig. 4.1. The ML service is optional: if it is down, everything except the ML screen keeps working, and that screen says the model is unavailable.

## 8. Implementation milestones

1. Audit (this document).
2. Prisma schema and migrations, category mapping, INR threshold seeding.
3. ETL (CSV and OFF) with a quality report, and the import into PostgreSQL.
4. INR engine with exhaustive boundary tests.
5. REST API: products, search, categories, alternatives, compare, auth, history, favourites, preferences, submissions.
6. ML: target audit, training, evaluation, SHAP, inference service, API integration.
7. OCR: preprocessing, Tesseract, nutrition parser, review flow.
8. Assistant: intent router, DB-grounded facts, LLM provider abstraction, deterministic fallback.
9. Expo app with all 14 screens wired to the API.
10. Tests (unit, integration, ML, mobile) and documentation.

## 9. Acceptance criteria

The 25 criteria in the brief are tracked in `docs/FINAL_REPORT.md`. Each is marked *implemented and tested*, *implemented but not tested*, *partial*, or *not implemented*, with the evidence: the command run and its result.
