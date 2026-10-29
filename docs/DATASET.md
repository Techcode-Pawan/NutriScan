# Dataset and ETL

## Sources

| Source | Records | Barcodes | Provenance | Licence |
|---|---|---|---|---|
| Open Food Facts snapshot `data/raw/off/off_india_2026-10-29.jsonl` | 4,067 India-tagged products with completed nutrition facts, the most-scanned first | yes (GS1-validated) | `.meta.json` next to the snapshot | ODbL 1.0 (database), DbCL 1.0 (contents), CC BY-SA (images) |
| Legacy CSV `data/raw/packaged_foods_india.csv` (from the prototype) | 852 | **none** | collection source and date unrecorded for >99% of rows | none stated; treated as project data |

The prototype's 394 generated "Series #N" products and 6 hand-written demo products are **not** imported; they remain only in `legacy/prototype/`.

## Pipeline

```
etl/fetch_off.py               Open Food Facts search service, ≤ 10 req/min, identifying User-Agent → dated JSONL + meta
etl/enrich_off_ingredients.py  per-product API for ingredient text (resumable; OFF throttles hard, ~25 req/min)
npm run etl                    services/api/src/scripts/etl.ts → data/processed/*
npm run data:import            services/api/src/scripts/import.ts → PostgreSQL (transactions of 100, upserts)
```

These run manually, never at application start. The app works without network access to OFF.

### Cleaning rules (thesis Table 3.2)

| Step | Implementation (`services/api/src/etl`) |
|---|---|
| 1. Barcode normalisation | `barcode.ts`: numeric EAN-8 / UPC-A (stored as 13 digits) / EAN-13 / GTIN-14 with a leading 0; GS1 check digit verified; invalid codes rejected, **never invented** |
| 2. Duplicate removal | `dedupe()`: one record per barcode (OFF) or per name+brand (CSV), keeping the most complete, then the most recent |
| 3. Unit standardisation | kJ → kcal (÷ 4.184); salt → sodium (÷ 2.5, in mg); sodium g → mg; mg → g where needed |
| 4. Plausibility | reject negatives, > 100 g per 100, energy > 900 kcal, sugars > carbohydrates, saturated fat > fat, sodium > 40,000 mg, macros > 105 g; **flag** energy that is inconsistent with the macros |
| 5. Missing values | stored as `NULL`, never imputed; completeness is recorded per product |
| 6. Text cleaning | Unicode NFKC normalisation, ®/™/NBSP/U+FFFD removed, whitespace collapsed, brands title-cased; records without a usable name are rejected |
| 7. Category mapping | `data/import/category_mapping.json`: ordered OFF tag rules, then legacy (category, subcategory) rules, then name-keyword rules; unmapped records are flagged and not rated |
| 8. Import | upsert by `sourceRef` / barcode inside transactions; INR is computed and stored |

### Measurement basis

* **OFF**: `*_100g` fields are OFF-normalised per 100 g (per 100 ml for drinks). The basis is per 100 ml for beverage categories, or by `quantity` unit when the product is uncategorised.
* **Legacy CSV**: the basis is never stated.
  * `Serving_Size_g == 100`: *assumed* per 100 (flag `basis_assumed`, 741 rows).
  * Otherwise, if the macros or energy exceed what one serving could hold: *inferred* per 100 (`basis_inferred`).
  * Otherwise: **`UNKNOWN`**, so no rating is computed (`basis_unknown`).
* **Data-quality guard**: dry categories with implausibly low energy (for example a biscuit at 57 kcal "per 100 g") are probably per-serving values. They are set to `UNKNOWN` (`suspected_per_serving_values`), with per-category limits stored in the mapping file.

### Other decisions

* The CSV has fibre = 0 in 600+ rows, which probably means "not declared". These are kept as 0 and flagged `fibre_zero_unverified`. That does not change ratings, because ≤ 3 g earns no positive points either way.
* `<x` values are stored at the upper bound and flagged; decimal commas are parsed.
* Vegetarian status comes from OFF's `ingredients_analysis_tags` and labels, or is `false` when a non-vegetarian ingredient is named. It is **never inferred as true** from missing evidence.

## Results (run of 2026-10-29; full report: `data/processed/quality_report.md`)

| Measure (thesis Table 3.3) | Value |
|---|---|
| Raw records (CSV + OFF) | 4,919 |
| After barcode validation and de-duplication | 4,691 |
| After plausibility checks | **4,542** imported (3,730 OFF with barcodes + 812 CSV without) |
| Mapped to a primary category | 3,799 (83.6%) |
| All core nutrients, full INR score | 1,540 (33.9%) |
| Fibre/protein missing, partial score | 558 (12.3%) |
| No score (missing data, exempt, unmapped, basis unknown) | 2,444 (53.8%) |

Rejected: 102 invalid barcodes, 8 duplicates, 149 implausible, 118 without a name (see `data/processed/rejected.jsonl`). In the database, 2,098 products currently have a star rating. Ingredient text is available for 1,266 products: all CSV rows, plus the OFF products enriched so far (534 of 4,067 fetched before OFF throttling; re-run the enrichment to resume).

This dataset has **not been independently verified** against physical labels.

## Sample development dataset

`data/import/sample_products.jsonl` holds 120 **real** cleaned records: up to 4 OFF products per category plus 12 CSV rows. Load it with `npm run data:sample` for a quick setup. The automated tests use separate fixtures with GS1 restricted-circulation barcodes (`200…`), only in the `nutriscan_test` database.

## Importing more records

1. Fetch more pages: `python etl/fetch_off.py --pages 80` (or another `--country`).
2. Optionally enrich ingredients: `python etl/enrich_off_ingredients.py data/raw/off/<snapshot>.jsonl`.
3. Run `npm --prefix services/api run etl && npm --prefix services/api run data:import`. The ETL uses the newest snapshot; pass `--off <file>` to choose one.
4. After changing `category_mapping.json`, run the ETL and import again, or `npm run scores:recompute`.
5. User submissions: `npm run submissions:review -- list | approve <id> [--category <slug>] | reject <id> --note "..."`.

Optional live lookup: with `OFF_LIVE_LOOKUP=true`, unknown barcodes are fetched from OFF at request time, normalised with the same rules, and stored with OFF provenance. It is off by default, following the thesis design.

## Licensing obligations

Open Food Facts data are under the **Open Database License**. NutriScan:

* shows attribution in the app (product page, Privacy screen, `GET /api/attribution`) and in this repository;
* keeps the source reference (`products.source_ref`) and last-modified time for every OFF record;
* must publish any redistributed derived database (for example a dump of `products` + `nutrition_facts`) under ODbL, with share-alike;
* uses images under CC BY-SA, hot-linked from OFF and not rehosted.
