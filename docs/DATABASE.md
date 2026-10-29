# Database

PostgreSQL 14+ with `pg_trgm`, managed by Prisma 6. Schema: `services/api/prisma/schema.prisma`. Migration: `prisma/migrations/20261029000000_init/migration.sql` (generated SQL, plus hand-written trigram indexes and CHECK constraints).

```bash
npm --prefix services/api run db:migrate        # prisma migrate deploy (DATABASE_URL)
npm --prefix services/api run db:migrate:test   # same, against TEST_DATABASE_URL
npm --prefix services/api run db:seed           # categories, INR thresholds, algorithm record (idempotent; import runs it too)
```

## Tables vs thesis Appendix A

| Thesis table | Implemented | Changes and why |
|---|---|---|
| `categories` | `categories` | Adds `slug`, `inr_class` (SOLID / LIQUID / EXEMPT / null = not covered), `is_beverage` and `description`; `parent_id` is kept |
| `products` (PK barcode) | `products` (PK `id` cuid, **unique nullable `barcode` VARCHAR(14)**) | Legacy CSV products have no barcode, so a surrogate key is needed; barcode lookups still use a unique index. Adds `subcategory`, `quantity`, `is_vegetarian` (nullable = unknown), `data_source`, `source_ref` (unique provenance id), `source_modified_at`, `quality_flags[]`, `reference_labels` (OFF Nutri-Score grade for ML evaluation), `import_batch_id`, timestamps |
| `nutrition_facts` | same | Adds `basis UNKNOWN`, `basis_note`, `trans_fat_g`, `fruit_veg_pct`, `nuts_legumes_millets_pct`, `completeness`, `extra` (JSON for cholesterol/calcium/iron); every nutrient is nullable (NULL = missing, never 0) |
| `health_scores` (score 0–100, band) | `health_scores` (INR only) | Stores `status`, `inr_class`, `star_rating` (0.5–5), `final_score`, `baseline_points`, `positive_points`, `breakdown` (JSON), `explanation` (JSON), `data_completeness`, `is_hfss`, `algorithm_version` and `computed_at`, because the thesis replaced §4.6's 0–100 score with INR (§4.7). One row per product (`product_id` unique) |
| `category_thresholds` (best / worst / weight) | `category_thresholds` (INR rows) | Rows `(algorithm_version, inr_class, parameter, kind, points, greater_than)`: the Schedule III tables stored as versioned data (170 rows) |
| – | `scoring_algorithms` | Version, source, full config, assumptions, active flag |
| `users` | `users` | Adds `display_name`, `token_version` (token revocation), timestamps; bcrypt cost 12 |
| `user_preferences` | same | Adds `low_saturated_fat`, `age_group` (optional) |
| `scan_history` | same | References `product_id`; adds `method`; index `(user_id, scanned_at DESC)` |
| `favorites` | same | PK `(user_id, product_id)` |
| `product_submissions` | same | Adds `user_id` (nullable for guests), `name`, `brand`, `source` (MANUAL / OCR), `image_path`, `reviewer_note`, `reviewed_at`; status is an enum |
| – | `import_batches` | Provenance of each import run with statistics |
| – | `ml_model_versions`, `ml_predictions` | Experimental ML output, **kept separate from `health_scores`**; unique `(product_id, model_version)` |
| – | `assistant_queries` | Intent and provider only (no question text) |

## Integrity and performance

* Foreign keys cascade from `products` to nutrition, scores, predictions, history and favourites, and from `users` to preferences, history and favourites. Submissions and assistant logs use `SET NULL`.
* CHECK constraints: all nutrients ≥ 0, energy ≤ 900 kcal, star rating 0.5–5.
* Indexes:
  * barcode (unique), `source_ref` (unique), `category_id`, `brand`, `data_source`;
  * GIN trigram on `products.name` and `products.brand` (fast `ILIKE` search);
  * `health_scores.star_rating DESC`, `status`;
  * `nutrition_facts.sugars_g`, `sodium_mg`;
  * `scan_history (user_id, scanned_at DESC)`.
* Alternatives use a single indexed query: same category, `star_rating > x`, status filter, capped at 500 candidates. Search uses one parameterised SQL query (sort column from a whitelist, `LIKE` wildcards escaped), then one `IN` query to load the rows. There are no N+1 queries.
* Scores are pre-computed at import (`npm run scores:recompute` after a methodology or mapping change), so reads never recompute.
* Connection pooling: Prisma's pool (`?connection_limit=` on `DATABASE_URL`).
* Imports run in transactions of 100 records, falling back to per-record transactions so one bad row does not block the others.
