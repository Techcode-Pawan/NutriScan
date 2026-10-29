"""Loads the trained pipeline and produces predictions with SHAP explanations."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from preprocessing.features import FEATURE_LABELS, GRADES, base_feature, features_frame, ml_index

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"


class ModelNotAvailable(RuntimeError):
    pass


class Predictor:
    def __init__(self, artifacts: Path = ARTIFACTS):
        model_path = artifacts / "model.joblib"
        meta_path = artifacts / "metadata.json"
        if not model_path.exists() or not meta_path.exists():
            raise ModelNotAvailable(f"No trained model in {artifacts}. Run `python -m training.train` first.")
        self.model = joblib.load(model_path)
        self.metadata: dict[str, Any] = json.loads(meta_path.read_text(encoding="utf-8"))
        self.version: str = self.metadata["modelVersion"]
        self._explainer = None

    @property
    def explainer(self):
        if self._explainer is None:
            import shap  # imported lazily: optional at import time, heavy to load

            self._explainer = shap.TreeExplainer(self.model.named_steps["rf"])
        return self._explainer

    def _contributions(self, Xt: np.ndarray, class_index: int, row: dict[str, Any]) -> list[dict[str, Any]]:
        """SHAP values for the predicted class, aggregated back to the original features."""
        try:
            values = self.explainer.shap_values(Xt, check_additivity=False)
        except Exception:
            return []
        arr = np.asarray(values)
        # shap returns either a list per class or an array shaped (rows, features, classes)
        if isinstance(values, list):
            contrib = np.asarray(values[class_index])[0]
        elif arr.ndim == 3:
            contrib = arr[0, :, class_index]
        else:
            contrib = arr[0]
        names = self.model.named_steps["pre"].get_feature_names_out()
        totals: dict[str, float] = {}
        for name, v in zip(names, contrib):
            key = base_feature(str(name))
            totals[key] = totals.get(key, 0.0) + float(v)
        out = [
            {"feature": k, "label": FEATURE_LABELS.get(k, k), "value": row.get(k), "contribution": round(v, 4)}
            for k, v in totals.items()
        ]
        return sorted(out, key=lambda r: -abs(r["contribution"]))[:6]

    def predict(self, rows: list[dict[str, Any]], explain: bool = True) -> list[dict[str, Any]]:
        X = features_frame(rows)
        proba = self.model.predict_proba(X)
        classes = [str(c) for c in self.model.classes_]
        results = []
        Xt = self.model.named_steps["pre"].transform(X) if explain else None
        if Xt is not None and hasattr(Xt, "toarray"):
            Xt = Xt.toarray()
        for i, row in enumerate(rows):
            probs = {g: 0.0 for g in GRADES}
            for c, p in zip(classes, proba[i]):
                probs[c] = round(float(p), 4)
            k = int(np.argmax(proba[i]))
            results.append(
                {
                    "predictedGrade": classes[k],
                    "probabilities": probs,
                    "mlIndex": round(ml_index(probs), 1),
                    "contributions": self._contributions(Xt[i : i + 1], k, {**row, "categorySlug": row.get("categorySlug") or "unmapped"}) if explain else [],
                    "modelVersion": self.version,
                }
            )
        return results
