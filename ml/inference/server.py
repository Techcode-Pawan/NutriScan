"""HTTP inference service used by the Node API (optional component).

    cd ml && ../.venv/Scripts/python -m uvicorn inference.server:app --host 127.0.0.1 --port 8001

If no trained model exists, /health reports it and /model and /predict return 503, so the API
can tell users that the experimental ML estimate is unavailable.
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from inference.predictor import ModelNotAvailable, Predictor

app = FastAPI(title="NutriScan ML inference", version="1.0")

try:
    predictor: Optional[Predictor] = Predictor()
    load_error: Optional[str] = None
except ModelNotAvailable as exc:
    predictor = None
    load_error = str(exc)


class Item(BaseModel):
    energyKcal: Optional[float] = Field(default=None, ge=0, le=900)
    fatG: Optional[float] = Field(default=None, ge=0, le=100)
    saturatedFatG: Optional[float] = Field(default=None, ge=0, le=100)
    carbohydratesG: Optional[float] = Field(default=None, ge=0, le=100)
    sugarsG: Optional[float] = Field(default=None, ge=0, le=100)
    fiberG: Optional[float] = Field(default=None, ge=0, le=100)
    proteinG: Optional[float] = Field(default=None, ge=0, le=100)
    sodiumMg: Optional[float] = Field(default=None, ge=0, le=40000)
    isLiquid: bool = False
    categorySlug: Optional[str] = Field(default=None, max_length=60)


class PredictRequest(BaseModel):
    items: list[Item] = Field(min_length=1, max_length=50)


def _require() -> Predictor:
    if predictor is None:
        raise HTTPException(status_code=503, detail=load_error or "model not loaded")
    return predictor


@app.get("/health")
def health():
    return {"status": "ok" if predictor else "no_model", "modelVersion": predictor.version if predictor else None, "error": load_error}


@app.get("/model")
def model_info():
    p = _require()
    m = p.metadata
    return {
        "modelVersion": m["modelVersion"],
        "target": m["target"],
        "algorithm": m["algorithm"],
        "trainedAt": m["trainedAt"],
        "metrics": {
            "test": {k: v for k, v in m["metrics"]["test"].items() if k != "per_class"},
            "majorityClassBaseline": {k: m["metrics"]["majorityClassBaseline"][k] for k in ("accuracy", "macro_f1")},
            "dataset": m["metrics"]["dataset"],
        },
        "config": m["config"],
    }


@app.post("/predict")
def predict(req: PredictRequest):
    p = _require()
    return p.predict([item.model_dump() for item in req.items])
