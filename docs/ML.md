# Experimental ML health estimate

The presentation proposes a Random Forest "health score". The thesis rates products with rule-based INR and explicitly uses no ML. NutriScan implements the ML idea as a **separate, clearly labelled, experimental** system that never alters INR ratings or recommendations.

## Target definition: why Nutri-Score

Neither dataset contains ground-truth "health score" labels, and labels were **not** fabricated. Options considered:

| Candidate target | Problem |
|---|---|
| Hand-made 0–100 score | No ground truth; it would be a fabricated label |
| INR stars | Circular: a deterministic function of the same inputs, which the engine already computes exactly |
| **Open Food Facts Nutri-Score grade (A–E)** | An independently defined, published nutrient-profile label, available for 1,683 of the products. **Chosen.** |

The model therefore **estimates the Nutri-Score grade OFF publishes**, from label nutrients (energy, fat, saturated fat, carbohydrates, sugars, fibre, protein, sodium), a drink flag and the NutriScan category. It is useful where the grade is unknown (for example values read from a label by OCR). It is not:

* an independent validation of INR;
* a medical or nutritional validity measure;
* a "true healthiness" score.

Nutri-Score is itself algorithmic and uses fruit/vegetable/legume content that our data mostly lack, so the achievable agreement is bounded.

A 0–100 **ML index** is derived as the expected value of the class probabilities, with A=100, B=75, C=50, D=25 and E=0. It is labelled as such in the UI.

## Protocol (`ml/training/train.py`)

1. Labelled set: OFF products with a valid grade, known basis and the four core nutrients. That gives 1,453 products: A 175, B 146, C 209, D 342, E 581.
2. Leakage prevention: products sharing a normalised name+brand **or** an identical nutrient vector are put in the same group. `StratifiedGroupKFold(7)` assigns 1 fold to test (208), 1 to validation (208) and 5 to training (1,037). The test asserts that no group crosses splits.
3. Pipeline: median imputation **with missing-indicator columns** (fitted on training data only), one-hot category (`handle_unknown=ignore`), and `RandomForestClassifier(class_weight="balanced")`.
4. Hyper-parameters selected on the validation fold only (macro-F1) from `max_depth ∈ {None, 12, 20}`, `min_samples_leaf ∈ {1, 3}`, `max_features ∈ {sqrt, 0.5}` with 300 trees. Chosen: depth 12, leaf 1, `max_features` 0.5.
5. Refit on train+validation; **evaluated once** on test.
6. Additional estimate: grouped 7-fold cross-validation with the chosen parameters.

## Results (model `rf-nutriscore-20261028-cbfd11a1e8`; computed by the script, see `ml/artifacts/evaluation_report.md`)

| Metric | Random Forest (test, n=208) | Majority-class baseline |
|---|---|---|
| Accuracy | 0.721 | 0.399 |
| Macro F1 | 0.674 | 0.114 |
| Within one grade | 0.957 | — |

Grouped 7-fold CV: accuracy **0.746 ± 0.046**, macro-F1 **0.690 ± 0.046**. This is slightly optimistic, because parameters were selected on one fold.

Per-class test F1: A 0.815, B 0.634, **C 0.370**, D 0.690, E 0.861. The middle grade is hardest. The full per-class report and confusion matrix are in `ml/artifacts/evaluation_report.md` and `metadata.json`.

An earlier training run on a previous ETL version (before a category-mapping bug fix) scored 0.769 / 0.748 on its own test split. That difference is consistent with the ± 0.046 variation across folds, and shows why the CV estimate is reported alongside the single split.

## Explanations

The inference service uses SHAP `TreeExplainer` on the forest. It returns the contributions toward the **predicted class**, aggregated back to the original features: one-hot category columns are combined into "Product category", and missing-indicator columns are folded into their nutrient. The UI states that these are what the model relied on, not causal effects. Global impurity importances are listed in the evaluation report.

## Serving

* `ml/inference/server.py` (FastAPI): `GET /health`, `GET /model` (version, metrics, config), `POST /predict` (up to 50 items).
* The API (`modules/ml/ml.service.ts`) registers the model version in `ml_model_versions` and caches predictions per product and version in `ml_predictions`. Those are separate from `health_scores`.
* If the service is down or untrained, the API returns `status: "unavailable"` and every other feature continues.
* The model needs energy, sugars, saturated fat and sodium; otherwise it returns `insufficient_data`.
* For products that were in the training data, the UI shows OFF's reference grade and notes that agreement is not evidence of accuracy.

## Reproducing

```bash
python -m venv .venv && .venv/Scripts/pip install -r ml/requirements.txt
npm --prefix services/api run etl                # produces data/processed/products.jsonl
cd ml && ../.venv/Scripts/python -m training.train
../.venv/Scripts/python -m pytest -q
```

Training is seeded (`SEED=42`), and a test asserts that two runs give identical test metrics. Artifacts: `model.joblib`, `metadata.json` (version, config, all metrics, data hash), `evaluation_report.md`, `splits.csv`.

## Tests (`ml/tests/test_ml.py`, 10 tests)

* missing values stay NaN;
* unlabelled and unknown-basis records are excluded;
* duplicates share a group and never cross splits;
* the imputer is fitted only on training rows;
* the ML-index range and mapping;
* feature-name mapping for SHAP;
* metric computation on known inputs;
* reproducible training that beats the baseline on a learnable fixture;
* prediction shape, probabilities and SHAP output;
* a missing model raises a clear error;
* the shipped model: inference on realistic inputs, unknown categories, and a sanity check that a high-sugar biscuit is not graded A.
