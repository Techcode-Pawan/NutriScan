# NutriScan data-quality report

Generated 2026-10-28T19:47:20.707Z by `npm run etl` (category mapping version 2026-10-29).

## Summary (thesis Table 3.3)

| Measure | Value |
|---|---|
| Raw records (CSV + OFF snapshot) | 4919 |
| Records after barcode validation and de-duplication | 4691 |
| Records after plausibility checks | 4542 |
| Records mapped to a primary category | 3799 (83.6%) |
| Records with all core nutrients (full INR score) | 1540 (33.9%) |
| Records with fibre or protein missing (partial score) | 558 (12.3%) |
| Records without a score (missing data, exempt, unmapped, basis unknown) | 2444 (53.8%) |

## Sources

* Legacy CSV `raw\packaged_foods_india.csv`: 852 rows, 812 kept. Student-collected, provenance largely unrecorded, **no barcodes**; every record is flagged `unverified_source`.
* Open Food Facts snapshot `raw\off\off_india_2026-10-29.jsonl`: 4067 rows, 3730 kept, 534 enriched with ingredient text. Licence: ODbL 1.0 / DbCL 1.0 (images CC BY-SA). © Open Food Facts contributors.

## Rejections

Invalid barcode: 102 · duplicates: 8 · implausible values: 149 · no usable name: 118. Details in `rejected.jsonl`.

## INR status distribution

| Status | Products |
|---|---|
| RATED | 1540 |
| NOT_ELIGIBLE | 847 |
| INSUFFICIENT_DATA | 599 |
| EXEMPT | 834 |
| PARTIAL | 558 |
| BASIS_UNKNOWN | 164 |

## By category

| Category | Products | With star rating |
|---|---|---|
| (unmapped) | 743 | 0 |
| snacks-namkeen | 489 | 354 |
| biscuits-cookies | 411 | 323 |
| chocolates-confectionery | 372 | 270 |
| beverages | 336 | 276 |
| cakes-bakery | 189 | 120 |
| sauces-pickles | 154 | 106 |
| grains-flours | 154 | 0 |
| noodles-pasta | 153 | 106 |
| plain-dairy | 138 | 0 |
| breakfast-cereals | 119 | 91 |
| oils-ghee | 119 | 0 |
| plain-produce | 116 | 0 |
| dairy-products | 110 | 68 |
| spices-seasonings | 109 | 0 |
| ice-cream-desserts | 107 | 69 |
| spreads | 96 | 70 |
| dairy-beverages | 86 | 65 |
| supplements-infant | 85 | 0 |
| ready-to-eat | 74 | 61 |
| tea-coffee | 73 | 0 |
| dried-fruits | 61 | 23 |
| sugar-honey | 57 | 0 |
| indian-sweets | 53 | 41 |
| waters | 45 | 0 |
| health-drink-powders | 44 | 29 |
| bars-nutrition | 38 | 26 |
| alcoholic-beverages | 11 | 0 |

## Quality flags

| Flag | Records |
|---|---|
| `unverified_source` | 812 |
| `category_inferred_from_name` | 787 |
| `category_unmapped` | 743 |
| `basis_assumed` | 741 |
| `fibre_zero_unverified` | 572 |
| `suspected_per_serving_values` | 99 |
| `energy_macro_mismatch` | 84 |
| `basis_unknown` | 65 |
| `less_than_value` | 37 |
| `energy_converted_from_kj` | 13 |
| `basis_inferred` | 6 |
| `decimal_comma` | 2 |
| `invalid_number` | 1 |

## Missing values per field (kept as NULL, never imputed)

| Field | Missing |
|---|---|
| nutsLegumesMilletsPct | 4390 |
| fruitVegPct | 4311 |
| extra | 4221 |
| transFatG | 3733 |
| fiberG | 2141 |
| sodiumMg | 1325 |
| saturatedFatG | 961 |
| sugarsG | 890 |
| fatG | 533 |
| proteinG | 526 |
| carbohydratesG | 500 |
| energyKcal | 488 |

Average nutrition completeness: 0.799.

This dataset has **not been independently verified** against physical labels.
