import math
from pathlib import Path

import numpy as np
import pytest

from evaluation.metrics import classification_metrics
from inference.predictor import ModelNotAvailable, Predictor
from preprocessing.dataset import build_dataset
from preprocessing.features import GRADES, NUMERIC_FEATURES, base_feature, features_frame, ml_index
from training.train import make_pipeline, split_indices, train

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"


def synthetic_products(n: int = 420, seed: int = 0):
    """Labelled fixtures for pipeline tests only (never written to the product database).
    The label is a simple function of sugar so the pipeline has something learnable."""
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        sugar = float(rng.uniform(0, 60))
        grade = GRADES[min(4, int(sugar // 12))]
        out.append(
            {
                "sourceRef": f"test:{i}",
                "name": f"Test product {i}",
                "brand": f"Brand {i % 37}",
                "categorySlug": ["biscuits-cookies", "beverages", None][i % 3],
                "referenceLabels": {"nutriscoreGrade": grade},
                "nutrition": {
                    "basis": "PER_100ML" if i % 3 == 1 else "PER_100G",
                    "energyKcal": float(rng.uniform(20, 550)),
                    "fatG": float(rng.uniform(0, 30)),
                    "saturatedFatG": float(rng.uniform(0, 10)),
                    "carbohydratesG": 60.0,
                    "sugarsG": sugar,
                    "fiberG": None if i % 4 == 0 else float(rng.uniform(0, 8)),
                    "proteinG": float(rng.uniform(0, 15)),
                    "sodiumMg": float(rng.uniform(0, 900)),
                },
            }
        )
    return out


def test_missing_values_stay_nan_not_zero():
    X = features_frame([{"energyKcal": 100, "sugarsG": None, "categorySlug": None}])
    assert math.isnan(X.loc[0, "sugarsG"])
    assert math.isnan(X.loc[0, "fiberG"])
    assert X.loc[0, "categorySlug"] == "unmapped"
    assert X.loc[0, "isLiquid"] == 0.0


def test_dataset_excludes_unlabelled_and_unknown_basis():
    products = synthetic_products(30)
    products[0]["referenceLabels"] = None
    products[1]["nutrition"]["basis"] = "UNKNOWN"
    products[2]["nutrition"]["sodiumMg"] = None
    X, y, groups, stats = build_dataset(products)
    assert stats["usable"] == 27 == len(y) == len(X) == len(groups)
    assert stats["excluded_basis_unknown"] == 1 and stats["excluded_no_core"] == 1


def test_duplicates_share_a_group_and_never_cross_splits():
    products = synthetic_products(210)
    clone = dict(products[5], sourceRef="test:clone")
    products.append(clone)
    X, y, groups, _ = build_dataset(products)
    assert groups.iloc[5] == groups.iloc[len(groups) - 1]
    train_idx, val_idx, test_idx = split_indices(y, groups)
    assert not set(groups.iloc[train_idx]) & set(groups.iloc[test_idx])
    assert not set(groups.iloc[val_idx]) & set(groups.iloc[test_idx])
    assert len(set(train_idx) | set(val_idx) | set(test_idx)) == len(y)


def test_imputer_is_fitted_on_training_data_only():
    X, y, groups, _ = build_dataset(synthetic_products())
    train_idx, _, test_idx = split_indices(y, groups)
    pipe = make_pipeline({"n_estimators": 20, "max_depth": 6}).fit(X.iloc[train_idx], y.iloc[train_idx])
    medians = pipe.named_steps["pre"].named_transformers_["num"].statistics_
    expected = np.nanmedian(X.iloc[train_idx][NUMERIC_FEATURES].to_numpy(dtype=float), axis=0)
    assert np.allclose(medians, expected)


def test_ml_index_range_and_mapping():
    assert ml_index({"a": 1.0}) == 100
    assert ml_index({"e": 1.0}) == 0
    assert ml_index({g: 0.2 for g in GRADES}) == pytest.approx(50)


def test_base_feature_maps_transformed_names():
    assert base_feature("num__sugarsG") == "sugarsG"
    assert base_feature("num__missingindicator_fiberG") == "fiberG"
    assert base_feature("cat__categorySlug_beverages") == "categorySlug"


def test_metrics_are_computed_not_assumed():
    m = classification_metrics(["a", "b", "c", "e"], ["a", "c", "c", "a"])
    assert m["accuracy"] == 0.5
    assert m["within_one_grade"] == 0.75
    assert m["confusion_matrix"]["rows_true_cols_pred"][1][2] == 1


def test_training_is_reproducible(tmp_path):
    import json

    products_file = tmp_path / "data" / "processed" / "products.jsonl"
    products_file.parent.mkdir(parents=True)
    products_file.write_text("\n".join(json.dumps(p) for p in synthetic_products()), encoding="utf-8")
    grid = {"n_estimators": [30], "max_depth": [8]}
    a = train(products_file, tmp_path / "a", grid=grid)
    b = train(products_file, tmp_path / "b", grid=grid)
    assert a["metrics"]["test"] == b["metrics"]["test"]
    assert a["metrics"]["test"]["accuracy"] > a["metrics"]["majorityClassBaseline"]["accuracy"]

    p = Predictor(tmp_path / "a")
    out = p.predict([{"energyKcal": 400, "sugarsG": 55, "saturatedFatG": 5, "sodiumMg": 200, "categorySlug": "biscuits-cookies"}])[0]
    assert out["predictedGrade"] in GRADES
    assert sum(out["probabilities"].values()) == pytest.approx(1, abs=1e-3)
    assert 0 <= out["mlIndex"] <= 100
    assert out["contributions"], "SHAP contributions should be returned"
    assert any(c["feature"] == "sugarsG" for c in out["contributions"])


def test_missing_model_raises(tmp_path):
    with pytest.raises(ModelNotAvailable):
        Predictor(tmp_path)


@pytest.mark.skipif(not (ARTIFACTS / "model.joblib").exists(), reason="trained model not present")
def test_shipped_model_inference():
    p = Predictor()
    out = p.predict(
        [
            {"energyKcal": 480, "fatG": 20, "saturatedFatG": 10, "carbohydratesG": 68, "sugarsG": 30, "fiberG": 1, "proteinG": 6, "sodiumMg": 300, "categorySlug": "biscuits-cookies"},
            {"energyKcal": 20, "sugarsG": None, "saturatedFatG": 0, "sodiumMg": 10, "isLiquid": True, "categorySlug": "an-unknown-category"},
        ]
    )
    assert len(out) == 2
    for o in out:
        assert o["predictedGrade"] in GRADES and 0 <= o["mlIndex"] <= 100
        assert o["modelVersion"] == p.version
    # A high-sugar, high-saturated-fat biscuit should not be estimated as grade A.
    assert out[0]["predictedGrade"] != "a"
