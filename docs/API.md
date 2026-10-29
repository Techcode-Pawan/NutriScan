# NutriScan REST API

Base URL: `http://localhost:4000/api`. All bodies are JSON (except uploads, which are `multipart/form-data`).

**Response envelope**

* Success: `{ "data": ..., "meta"?: {...} }`
* Error: `{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "...", "details"?: ... } }`

**Auth:** `Authorization: Bearer <JWT>` from register/login (HS256, 7-day default, invalidated by logout-all, password change or account deletion).

**Product key:** routes taking `:barcode` accept a numeric barcode (GS1-validated; UPC-A is normalised to 13 digits) **or** a product id. Legacy CSV products have no barcode and are addressed by id.

**Pagination:** `page` (≥ 1) and `pageSize` (1–50, default 20); `meta = { page, pageSize, total, totalPages }`.

**Rate limits** (per IP): 300 req/min overall; auth 20 / 15 min; OCR 20 / 10 min; assistant 40 / 10 min; submissions 20 / h. Exceeding a limit returns `429 RATE_LIMITED`.

## Endpoints

### Thesis core endpoints (Table 4.10)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/products/:barcode` | optional | Product, nutrition, INR rating, breakdown, explanation, ingredient notes, source; adds `personal` context when logged in. `404 PRODUCT_NOT_FOUND` (`details.canSubmit`) / `400 INVALID_BARCODE` |
| GET | `/products/search?q=&category=&subcategory=&brand=&ratedOnly=&sort=&order=&page=&pageSize=` | – | Search name/brand/barcode. `sort`: `relevance`, `name`, `rating`, `energy`, `sugar`, `sodium`, `saturatedFat`, `protein`, `fiber` |
| GET | `/products/:barcode/alternatives?limit=&includePartial=&applyPreferences=` | optional | Same-category products with **strictly higher** INR stars, each with `reasons`, `tradeOffs` and `summary`; `excluded` counts; `message` when none |
| GET | `/categories` | – | Categories with `inrClass`, `productCount`, `ratedCount` |
| GET | `/categories/:id/products` | – | `:id` is a numeric id or slug; sorted by rating (desc) by default; accepts the same sort and paging options |
| POST | `/compare` | – | `{ "products": ["<key>", ...] }` (2–4; `barcodes` is also accepted) → aligned `rows` with `bestIndexes` (only when bases match), `summary` |
| POST | `/auth/register` | – | `{ email, password (≥ 8, letter + digit), displayName? }` → `201 { token, user }`; `409 EMAIL_TAKEN` |
| POST | `/auth/login` | – | `{ email, password }` → `{ token, user }`; `401 INVALID_CREDENTIALS` (same message for unknown email) |
| GET | `/history?page=&pageSize=` | required | The user's scans, newest first |
| POST | `/history` | required | `{ productId \| barcode, method: CAMERA\|MANUAL\|IMAGE\|SEARCH }` |
| DELETE | `/history` · `/history/:id` | required | Clear all / one entry (scoped to the owner; another user's id → 404) |
| GET | `/favorites` | required | Saved products |
| POST | `/favorites` | required | `{ productId \| barcode }` (idempotent) |
| DELETE | `/favorites/:barcode` | required | Remove (barcode or id) |
| GET | `/preferences` | required | `{ lowSugar, lowSodium, lowSaturatedFat, highFiber, highProtein, vegetarian, excludedIngredients[], ageGroup }` |
| PUT | `/preferences` | required | Any subset of the above (validated) |
| POST | `/submissions` | optional | Missing product: `name` (required), `barcode?`, `brand?`, `categorySlug?`, `ingredientsText?`, `nutrition?` (JSON), `source` (MANUAL\|OCR), optional `image` (multipart). → `201 PENDING`. **Not** added to the product database |

### Additional endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | `database`, `ml`, `assistant`, `scoring` version; returns 503 when the database is down |
| GET | `/scoring/methodology` | – | INR tables, assumptions, formula, disclaimer |
| GET | `/attribution` | – | Data-source and licence text |
| GET | `/products/:barcode/explanation` | – | INR breakdown and explanation only |
| GET | `/products/:barcode/ml` | – | Experimental ML estimate (`status: ok \| unavailable \| insufficient_data`), SHAP contributions, model metrics |
| GET | `/ml/status` | – | ML service availability and model metadata |
| POST | `/ml/predict` | – | Estimate for given nutrient values |
| POST | `/ocr/label` | – | multipart `image` → `rawText`, `fields` (value, unit, rawLine, confidence, notes), `basis`, `ingredientsText`, `warnings`, `reviewRequired: true` |
| POST | `/ocr/analyze` | – | User-reviewed values (`categorySlug`, `basis`, nutrients, `ingredientsText`) → INR result + explanation + ML; nothing stored; `422 IMPLAUSIBLE_VALUES` |
| POST | `/assistant/ask` | optional | `{ product, question, compareWith? }` → `{ answer, intent, provider, grounded, facts[], suggestions[], disclaimer, note? }` |
| GET | `/assistant/status` · `/assistant/suggestions?product=` | – | Provider mode / suggested questions |
| POST | `/auth/logout` · `/auth/logout-all` | required | Stateless logout / invalidate all tokens |
| GET · PATCH · DELETE | `/me` | required | Profile with counts / update `displayName` / delete the account and all personal data |
| POST | `/me/password` | required | `{ currentPassword, newPassword }` → new token (old tokens are invalidated) |
| GET | `/submissions/mine` | required | The user's submissions and their review status |

## Example: product lookup

```http
GET /api/products/8901719100956
```

```json
{
  "data": {
    "id": "cm...", "barcode": "8901719100956", "name": "Parle G", "brand": "Parle-G",
    "category": { "slug": "biscuits-cookies", "name": "Biscuits & Cookies", "inrClass": "SOLID", "isBeverage": false },
    "nutrition": { "basis": "PER_100G", "basisLabel": "per 100 g", "values": { "energyKcal": 454, "sugarsG": 25, "fiberG": null, "...": "..." }, "completeness": 0.88, "missing": ["Dietary fibre"] },
    "inr": {
      "status": "PARTIAL", "stars": 2.5, "finalScore": 10, "baselinePoints": 15, "positivePoints": 5,
      "breakdown": { "baseline": [{ "label": "Energy", "value": 454, "points": 5, "maxPoints": 10 }, "..."], "positive": ["..."], "capRule": "Baseline 15 <= 20: higher positive-point caps apply" },
      "explanation": { "headline": "2.5 out of 5 stars - partial rating...", "summary": ["..."], "calculation": "Baseline energy 5 + ... -> 2.5 stars (solid-food scale)." },
      "hfss": { "evaluable": true, "isHfss": true, "triggers": ["22% of energy from total sugars (limit < 10%)", "..."] }
    },
    "source": { "label": "Open Food Facts", "attribution": "...ODbL 1.0...", "verified": false, "qualityFlags": [] }
  },
  "meta": { "lookup": "local" }
}
```

## Error codes

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query failed Zod validation (`details[]` with paths) |
| 400 | `INVALID_BARCODE` · `INVALID_PRODUCT_KEY` · `UNKNOWN_CATEGORY` · `INVALID_JSON` · `INVALID_IMAGE` · `IMAGE_TOO_SMALL` · `IMAGE_REQUIRED` | – |
| 401 | `AUTH_REQUIRED` · `INVALID_TOKEN` · `INVALID_CREDENTIALS` | – |
| 404 | `PRODUCT_NOT_FOUND` (`details.canSubmit`) · `NOT_FOUND` · `ROUTE_NOT_FOUND` | – |
| 409 | `EMAIL_TAKEN` | – |
| 413 · 415 | `FILE_TOO_LARGE` · `UNSUPPORTED_MEDIA_TYPE` | – |
| 422 | `IMPLAUSIBLE_VALUES` | sugars > carbohydrates, etc. |
| 429 | `RATE_LIMITED` | – |
| 503 | `DATABASE_UNAVAILABLE` · `OCR_UNAVAILABLE` | – |
| 500 | `INTERNAL_ERROR` | logged server-side, with no request bodies |
