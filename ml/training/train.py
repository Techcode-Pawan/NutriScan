"""Trains and evaluates the experimental Random Forest Nutri-Score-grade classifier.

    cd ml && ../.venv/Scripts/python -m training.train          (Windows)
    cd ml && ../.venv/bin/python -m training.train              (macOS/Linux)

Protocol (no leakage):
  1. Build the labelled dataset (OFF products with a published Nutri-Score grade).
  2. Split by product group with StratifiedGroupKFold into train (~70%), validation (~15%) and
     test (~15%): near-duplicates never cross splits.
  3. Select hyper-parameters on the validation split only.
  4. Refit on train+validation with the chosen parameters; evaluate ONCE on the test split.
All preprocessing (median imputation, one-hot encoding) is fitted inside the pipeline on
training data only. Every metric written to artifacts/ is computed here; none are hand-entered.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import itertools
import json
import platform
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from evaluation.metrics import classification_metrics, render_report
from preprocessing.dataset import DEFAULT_PRODUCTS, build_dataset, load_products
from preprocessing.features import BINARY_FEATURES, CATEGORICAL_FEATURES, GRADES, NUMERIC_FEATURES

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
SEED = 42
PARAM_GRID = {
    "n_estimators": [300],
    "max_depth": [None, 12, 20],
    "min_samples_leaf": [1, 3],
    "max_features": ["sqrt", 0.5],
}


def make_pipeline(params: dict, seed: int = SEED) -> Pipeline:
    pre = ColumnTransformer(
        [
            ("num", SimpleImputer(strategy="median", add_indicator=True), NUMERIC_FEATURES),
            ("bin", "passthrough", BINARY_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=5), CATEGORICAL_FEATURES),
        ]
    )
    rf = RandomForestClassifier(class_weight="balanced", random_state=seed, n_jobs=-1, **params)
    return Pipeline([("pre", pre), ("rf", rf)])


def split_indices(y: pd.Series, groups: pd.Series, seed: int = SEED) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """~70/15/15 grouped, stratified split."""
    sgkf = StratifiedGroupKFold(n_splits=7, shuffle=True, random_state=seed)
    folds = [test for _, test in sgkf.split(np.zeros(len(y)), y, groups)]
    test_idx = folds[0]
    val_idx = folds[1]
    train_idx = np.concatenate(folds[2:])
    return np.sort(train_idx), np.sort(val_idx), np.sort(test_idx)


def train(products_path: Path = DEFAULT_PRODUCTS, out_dir: Path = ARTIFACTS, seed: int = SEED, grid: dict | None = None) -> dict:
    products = load_products(products_path)
    X, y, groups, data_stats = build_dataset(products)
    if len(y) < 200:
        raise SystemExit(f"Only {len(y)} labelled products available - not enough to train a meaningful model.")
    train_idx, val_idx, test_idx = split_indices(y, groups, seed)
    assert not (set(groups.iloc[train_idx]) & set(groups.iloc[test_idx])), "group leakage between train and test"
    assert not (set(groups.iloc[val_idx]) & set(groups.iloc[test_idx])), "group leakage between validation and test"

    grid = grid or PARAM_GRID
    search = []
    for values in itertools.product(*grid.values()):
        params = dict(zip(grid.keys(), values))
        model = make_pipeline(params, seed).fit(X.iloc[train_idx], y.iloc[train_idx])
        m = classification_metrics(y.iloc[val_idx], model.predict(X.iloc[val_idx]))
        search.append({"params": params, "val_macro_f1": m["macro_f1"], "val_accuracy": m["accuracy"]})
    best = max(search, key=lambda r: (r["val_macro_f1"], r["val_accuracy"]))

    trval = np.concatenate([train_idx, val_idx])
    model = make_pipeline(best["params"], seed).fit(X.iloc[trval], y.iloc[trval])
    test_pred = model.predict(X.iloc[test_idx])
    test_metrics = classification_metrics(y.iloc[test_idx], test_pred)

    # Grouped 7-fold cross-validation with the selected parameters: a variance estimate that does not
    # depend on one particular test split. (Parameters were chosen on the validation fold, so this is
    # slightly optimistic; the single held-out test result above remains the headline number.)
    cv_scores = []
    sgkf = StratifiedGroupKFold(n_splits=7, shuffle=True, random_state=seed)
    for tr, te in sgkf.split(np.zeros(len(y)), y, groups):
        m = make_pipeline(best["params"], seed).fit(X.iloc[tr], y.iloc[tr])
        r = classification_metrics(y.iloc[te], m.predict(X.iloc[te]))
        cv_scores.append({k: r[k] for k in ("accuracy", "macro_f1", "within_one_grade")})
    cv_summary = {
        k: {"mean": round(float(np.mean([s[k] for s in cv_scores])), 4), "std": round(float(np.std([s[k] for s in cv_scores])), 4)}
        for k in ("accuracy", "macro_f1", "within_one_grade")
    }

    majority = y.iloc[trval].value_counts().idxmax()
    baseline_metrics = classification_metrics(y.iloc[test_idx], np.full(len(test_idx), majority))

    # Impurity-based importances (global; they describe the model, not causal effects).
    names = model.named_steps["pre"].get_feature_names_out()
    importances = sorted(zip(names, model.named_steps["rf"].feature_importances_), key=lambda t: -t[1])

    data_hash = hashlib.sha256(products_path.read_bytes()).hexdigest()[:10]
    trained_at = dt.datetime.now(dt.timezone.utc)
    version = f"rf-nutriscore-{trained_at:%Y%m%d}-{data_hash}"
    metadata = {
        "modelVersion": version,
        "target": "Open Food Facts Nutri-Score grade (a-e) - published reference label",
        "algorithm": "RandomForestClassifier (scikit-learn), class_weight=balanced",
        "trainedAt": trained_at.isoformat(),
        "features": {"numeric": NUMERIC_FEATURES, "binary": BINARY_FEATURES, "categorical": CATEGORICAL_FEATURES},
        "classes": [str(c) for c in model.classes_],
        "mlIndex": "Expected value of predicted grade probabilities with A=100, B=75, C=50, D=25, E=0",
        "config": {
            "bestParams": best["params"],
            "paramGrid": {k: [str(v) for v in vs] for k, vs in grid.items()},
            "seed": seed,
            "split": {"train": int(len(train_idx)), "validation": int(len(val_idx)), "test": int(len(test_idx)), "method": "StratifiedGroupKFold(7): 5 folds train, 1 validation, 1 test"},
            "dataFile": str(products_path.relative_to(products_path.parents[2])) if len(products_path.parents) > 2 else str(products_path),
            "dataSha256Prefix": data_hash,
            "sklearn": sklearn.__version__,
            "python": platform.python_version(),
        },
        "metrics": {
            "test": test_metrics,
            "majorityClassBaseline": baseline_metrics,
            "groupedCrossValidation7Fold": {"folds": cv_scores, "summary": cv_summary},
            "validationSearch": search,
            "dataset": data_stats,
            "classDistribution": {g: int((y == g).sum()) for g in GRADES},
            "topImportances": [{"feature": str(n), "importance": round(float(v), 4)} for n, v in importances[:12]],
        },
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out_dir / "model.joblib")
    (out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (out_dir / "evaluation_report.md").write_text(render_report(metadata), encoding="utf-8")
    pd.DataFrame(
        {"index": X.index, "split": ["train" if i in set(train_idx) else "validation" if i in set(val_idx) else "test" for i in X.index]}
    ).to_csv(out_dir / "splits.csv", index=False)
    return metadata


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--products", type=Path, default=DEFAULT_PRODUCTS)
    ap.add_argument("--out", type=Path, default=ARTIFACTS)
    args = ap.parse_args()
    meta = train(args.products, args.out)
    t = meta["metrics"]["test"]
    b = meta["metrics"]["majorityClassBaseline"]
    print(f"Model {meta['modelVersion']} trained on {meta['config']['split']}")
    print(f"Test accuracy {t['accuracy']:.3f}, macro-F1 {t['macro_f1']:.3f}, within-one-grade {t['within_one_grade']:.3f}")
    cv = meta["metrics"]["groupedCrossValidation7Fold"]["summary"]
    print(f"Grouped 7-fold CV: accuracy {cv['accuracy']['mean']:.3f} +/- {cv['accuracy']['std']:.3f}, macro-F1 {cv['macro_f1']['mean']:.3f} +/- {cv['macro_f1']['std']:.3f}")
    print(f"Majority-class baseline: accuracy {b['accuracy']:.3f}, macro-F1 {b['macro_f1']:.3f}")
    print(f"Artifacts written to {args.out}")


if __name__ == "__main__":
    main()
