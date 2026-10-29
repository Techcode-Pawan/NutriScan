# INR scoring (primary rating)

NutriScan's star rating follows thesis §4.7 and the source it cites: **FSSAI Draft Notification F. No. Std./SP-08/T(FoPNL-N-01), 13 September 2022, Schedule III (Tables 1–6) and Schedule IV**. A copy is stored at `docs/reference/FSSAI_Draft_INR_2022.pdf`.

* Engine: `services/api/src/modules/scoring/inr.engine.ts`
* Tables (data, versioned `INR-FSSAI-DRAFT-2022-v1`): `inr.config.ts`, also seeded into the `category_thresholds` and `scoring_algorithms` tables
* Explanations: `inr.explain.ts`
* Methodology endpoint: `GET /api/scoring/methodology`

> Academic implementation of a draft regulation. It is not an official FSSAI rating or certification.

## Algorithm (thesis §4.7.9)

1. Find the product's INR class from its primary category: **SOLID** (Category I), **LIQUID** (Category II: non-dairy beverages, FSS 14.0 / 6.8.1), **EXEMPT** (Category III, Schedule IV), or *not covered* (`null`).
2. Require a known basis: per 100 g for solids, per 100 ml for liquids.
3. Require the core nutrients: energy, saturated fat, total sugars and sodium for solids; energy and total sugars for liquids. **Missing values are never treated as zero.** If any is missing, the result is `INSUFFICIENT_DATA`.
4. Beverage proviso: a beverage with declared energy = 0 or total sugars = 0 is `NOT_ELIGIBLE`.
5. Baseline points: each value earns the number of `> x` thresholds it exceeds (Table 2 / Table 3).
6. Positive points: FV, NLM, fibre and protein for solids; FV and protein for liquids.
7. Caps (Table 4):
   * Solid with baseline ≤ 20: protein ≤ 15, and FV/NLM/fibre ≤ 10 each. Baseline > 20: protein ≤ 7, and FV/NLM/fibre ≤ 5 each.
   * Liquid with baseline ≤ 10: FV ≤ 10, protein ≤ 15. Baseline > 10: FV ≤ 5, protein ≤ 7.
8. Final score = baseline − capped positive points (Table 5).
9. Stars come from the Table 6 band for the class.
10. Status is `RATED`, or `PARTIAL` when fibre or protein (where applicable) is missing. A partial result gets 0 points for that factor, so the true rating can only be higher. Partial ratings are excluded from recommendations by default (thesis §4.6.6).

## Tables (Schedule III)

Baseline points (each column lists the `>` threshold for 1, 2, 3 … points):

| Factor | Solid (per 100 g) | Max | Liquid (per 100 ml) | Max |
|---|---|---|---|---|
| Energy (kcal) | 80, 160 … 800 (step 80) | 10 | 6, 12 … 60 (step 6) | 10 |
| Saturated fat (g) | 1 … 10 (step 1), then 12 … 40 (step 2) | 25 | not scored | – |
| Total sugars (g) | 4.2 … 84 (step 4.2) | 20 | 0.1, 1.6 … 13.6 (step 1.5) | 10 |
| Sodium (mg) | 90 … 2250 (step 90) | 25 | not scored | – |

Positive points:

| Factor | Solid | Liquid |
|---|---|---|
| Fruit & vegetables (%) | 10, 15, 20 … 50, 55 | 5, 10 … 45, 55 |
| Nuts, legumes & millets (%) | 10, 15, 20 … 50, 55 | not scored |
| Dietary fibre (g) | 3 … 30 (step 3) | not scored |
| Protein (g) | 1.5, 2, 2.5, 3, 5, 7, 10, 15, 20 … 50 | same as solid |

Star bands (Table 6, identical to thesis Table 4.7 for solids):

| Stars | Solid final score | Liquid final score |
|---|---|---|
| 5 | ≤ −11 | ≤ 0 |
| 4.5 | −10 … −7 | 1 … 2 |
| 4 | −6 … −2 | 3 … 4 |
| 3.5 | −1 … 2 | 5 … 6 |
| 3 | 3 … 6 | 7 … 9 |
| 2.5 | 7 … 11 | 10 … 12 |
| 2 | 12 … 15 | 13 … 15 |
| 1.5 | 16 … 20 | 16 … 18 |
| 1 | 21 … 24 | 19 … 20 * |
| 0.5 | ≥ 25 | ≥ 21 * |

\* See assumption 1.

## Documented assumptions (isolated in `INR_CONFIG.assumptions`)

1. **The liquid bands overlap in the draft** (`16–18`, `18–20`, `≥20`). They are resolved first-match from the best band: 18 → 1.5★, 19–20 → 1★, ≥ 21 → 0.5★.
2. **The FV/NLM rows skip a step**: `>50` (solid) or `>45` (liquid), then `>55`. They are transcribed exactly as printed.
3. **Dairy beverages** use the Category I solid tables, per the Table 2 heading. Their per-100 ml values are treated as per-100 g.
4. **"Without energy and/or sugar"** means declared energy = 0 or declared sugars = 0.
5. **FV/NLM percentages** count only when declared in the ingredient list (`etl/ingredients.ts`). Starchy tubers (potato, cassava, tapioca) are not counted as vegetables. Undeclared FV/NLM earns 0 points; the explanation says so, and the rating is not marked partial.
6. **Category mapping**: the datasets carry no FSS Appendix A codes, so `data/import/category_mapping.json` maps source categories to INR classes. Unmapped products are not rated. Dry tea and coffee are "not covered". Malt/cocoa drink powders are scored per 100 g as sold.
7. **Rounding**: input values are rounded to 2 decimals before comparison, so float noise such as 4.2000001 does not cross a threshold.

## Differences from the prototype (`legacy/prototype/index.html`)

| Prototype | Now |
|---|---|
| kJ thresholds applied to kcal values | kcal thresholds from the draft |
| Sat fat / sugar / sodium capped at 10 points | 25 / 20 / 25 points as in the draft |
| Invented FV table, no NLM | Draft FV/NLM tables, declared percentages only |
| No positive-point caps | Table 4 caps |
| Bands `≤ −5 → 5★` etc. | Thesis Table 4.7 / draft Table 6 |
| No liquid scale, exempt categories rated | Liquid tables, Schedule IV exemptions, beverage proviso |
| Missing values treated as 0 | `INSUFFICIENT_DATA` / `PARTIAL` |

## Explanations

These are generated from fixed templates over the computed result, so they always agree with the numbers:

* main drivers (the two largest baseline contributors),
* positive points (and any cap applied),
* per-factor concerns with the draft reference values (Table 1),
* the full calculation string,
* missing or undeclared data,
* the draft HFSS check (sugar ≥ 10% of energy, saturated fat ≥ 10% of energy, or sodium ≥ 1 mg/kcal).

## Tests

`services/api/tests/unit/inr.engine.test.ts` (92 tests):

* an independent transcription of every table compared with the config;
* both sides of **every threshold** (`= t` keeps the lower points, `t + 0.01` earns the next);
* every star-band edge for both classes;
* the thesis worked example (11 − 7 = 4 → 3★) and a real dataset row (Hide & Seek: 22 − 5 = 17 → 1.5★);
* cap switching at baseline 20 / 21; negative final scores; extreme values;
* missing core nutrients (each one), partial ratings, undeclared FV/NLM;
* exempt, unmapped and unknown-basis products; the beverage proviso.

The integration tests check stored ratings for hand-computed fixtures.
