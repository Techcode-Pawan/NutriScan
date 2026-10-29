# ML evaluation report - rf-nutriscore-20261028-cbfd11a1e8

> Experimental model. It estimates the **Open Food Facts Nutri-Score grade** (a published reference label) from label nutrients.
> It is not the INR rating, not a validation of the INR methodology, and these metrics say nothing about medical or nutritional validity.

## Data

* Products in the cleaned file: 4542; with an OFF Nutri-Score grade: 1683; usable after excluding unknown basis (24) and missing core nutrients (206): **1453**.
* Class distribution: A=175, B=146, C=209, D=342, E=581.
* Split (grouped by product name/brand and identical nutrient vectors): train 1037, validation 208, test 208.
* Selected parameters (by validation macro-F1): `{'n_estimators': 300, 'max_depth': 12, 'min_samples_leaf': 1, 'max_features': 0.5}`.

## Test-set results (evaluated once, after model selection)

| Metric | Random Forest | Majority-class baseline |
|---|---|---|
| Accuracy | 0.721 | 0.399 |
| Macro precision | 0.676 | 0.080 |
| Macro recall | 0.686 | 0.200 |
| Macro F1 | 0.674 | 0.114 |
| Weighted F1 | 0.721 | 0.228 |
| Within one grade | 0.957 | 0.635 |

Grouped 7-fold cross-validation with the selected parameters: accuracy 0.746 ± 0.046, macro-F1 0.690 ± 0.046, within one grade 0.963 ± 0.010 (slightly optimistic because parameters were selected on one of the folds).

### Per class (test)

| Grade | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| A | 0.759 | 0.880 | 0.815 | 25 |
| B | 0.650 | 0.619 | 0.634 | 21 |
| C | 0.417 | 0.333 | 0.370 | 30 |
| D | 0.597 | 0.816 | 0.690 | 49 |
| E | 0.956 | 0.783 | 0.861 | 83 |

### Confusion matrix (rows = true grade, columns = predicted)

| | A | B | C | D | E |
|---|---|---|---|---|---|
| **A** | 22 | 1 | 2 | 0 | 0 |
| **B** | 4 | 13 | 4 | 0 | 0 |
| **C** | 3 | 5 | 10 | 11 | 1 |
| **D** | 0 | 1 | 6 | 40 | 2 |
| **E** | 0 | 0 | 2 | 16 | 65 |

## Global feature importance (impurity-based)

These describe what the model relies on; they are associations, not causal effects.

| Feature | Importance |
|---|---|
| num__saturatedFatG | 0.1574 |
| num__sugarsG | 0.1474 |
| num__sodiumMg | 0.1472 |
| num__proteinG | 0.1057 |
| num__fiberG | 0.0928 |
| num__energyKcal | 0.0889 |
| num__carbohydratesG | 0.0817 |
| num__fatG | 0.0749 |
| bin__isLiquid | 0.0181 |
| num__missingindicator_fiberG | 0.0135 |
| cat__categorySlug_beverages | 0.0109 |
| cat__categorySlug_unmapped | 0.0071 |

## Limitations

* Nutri-Score is itself computed by an algorithm from nutrients, fruit/vegetable/legume content and category; the model approximates that reference from incomplete label data (no fruit/vegetable percentage), so agreement is bounded.
* Open Food Facts data are crowd-sourced; some grades and nutrient values are wrong.
* Only India-tagged products from one snapshot were used; performance on other products is unknown.
