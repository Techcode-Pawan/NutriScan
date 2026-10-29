"""Feature definitions shared by training and inference.

Missing nutrient values stay NaN here; the model pipeline imputes them with training-set
medians and adds explicit "was missing" indicator columns, so missingness is visible to the
model instead of being silently treated as zero.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

NUMERIC_FEATURES = [
    "energyKcal",
    "fatG",
    "saturatedFatG",
    "carbohydratesG",
    "sugarsG",
    "fiberG",
    "proteinG",
    "sodiumMg",
]
BINARY_FEATURES = ["isLiquid"]
CATEGORICAL_FEATURES = ["categorySlug"]
ALL_FEATURES = NUMERIC_FEATURES + BINARY_FEATURES + CATEGORICAL_FEATURES

FEATURE_LABELS = {
    "energyKcal": "Energy",
    "fatG": "Total fat",
    "saturatedFatG": "Saturated fat",
    "carbohydratesG": "Carbohydrates",
    "sugarsG": "Sugars",
    "fiberG": "Fibre",
    "proteinG": "Protein",
    "sodiumMg": "Sodium",
    "isLiquid": "Drink (per 100 ml)",
    "categorySlug": "Product category",
}

GRADES = ["a", "b", "c", "d", "e"]
# Derived 0-100 index: expected value of the grade distribution with A=100 ... E=0.
GRADE_POINTS = {"a": 100.0, "b": 75.0, "c": 50.0, "d": 25.0, "e": 0.0}


def _num(v: Any) -> float:
    if v is None:
        return math.nan
    try:
        f = float(v)
    except (TypeError, ValueError):
        return math.nan
    return f if math.isfinite(f) else math.nan


def features_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    """Builds the model input frame from API-style feature dicts (camelCase keys)."""
    data = {k: [_num(r.get(k)) for r in rows] for k in NUMERIC_FEATURES}
    data["isLiquid"] = [1.0 if r.get("isLiquid") else 0.0 for r in rows]
    data["categorySlug"] = [str(r.get("categorySlug") or "unmapped") for r in rows]
    return pd.DataFrame(data, columns=ALL_FEATURES)


def ml_index(probabilities: dict[str, float]) -> float:
    return float(sum(GRADE_POINTS[g] * probabilities.get(g, 0.0) for g in GRADES))


def base_feature(transformed_name: str) -> str:
    """Maps a ColumnTransformer output name back to the original feature."""
    name = transformed_name.split("__", 1)[-1]
    if name.startswith("missingindicator_"):
        return name.removeprefix("missingindicator_")
    if name.startswith("categorySlug_"):
        return "categorySlug"
    return name


def to_float_array(df: pd.DataFrame) -> np.ndarray:
    return df[NUMERIC_FEATURES + BINARY_FEATURES].to_numpy(dtype=float)
