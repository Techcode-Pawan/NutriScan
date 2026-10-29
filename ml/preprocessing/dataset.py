"""Loads the cleaned product file produced by the ETL and builds the labelled ML dataset.

Target: the Nutri-Score grade (a-e) that Open Food Facts publishes for a product. It is an
independently defined, published reference label - not a ground-truth "healthiness" score - and
only Open Food Facts records carry it. Records without a valid grade are excluded; no labels
are created or inferred.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

from preprocessing.features import GRADES, features_frame

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PRODUCTS = REPO_ROOT / "data" / "processed" / "products.jsonl"


def load_products(path: Path = DEFAULT_PRODUCTS) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def _group_key(p: dict[str, Any]) -> str:
    """Products with the same normalised name+brand or identical nutrient vectors share a group,
    so near-duplicates (pack sizes, re-listings) never straddle train and test."""
    name = re.sub(r"[^a-z0-9]+", " ", (p.get("name") or "").lower()).strip()
    brand = re.sub(r"[^a-z0-9]+", " ", (p.get("brand") or "").lower()).strip()
    return f"{brand}|{name}"


def build_dataset(products: list[dict[str, Any]]) -> tuple[pd.DataFrame, pd.Series, pd.Series, dict[str, int]]:
    rows, labels, groups, meta = [], [], [], []
    stats = {"total": len(products), "with_reference_grade": 0, "excluded_basis_unknown": 0, "excluded_no_core": 0}
    for p in products:
        grade = (p.get("referenceLabels") or {}).get("nutriscoreGrade")
        if grade not in GRADES:
            continue
        stats["with_reference_grade"] += 1
        n = p["nutrition"]
        if n.get("basis") == "UNKNOWN":
            stats["excluded_basis_unknown"] += 1
            continue
        if n.get("energyKcal") is None or n.get("sugarsG") is None or n.get("saturatedFatG") is None or n.get("sodiumMg") is None:
            stats["excluded_no_core"] += 1
            continue
        rows.append({**n, "isLiquid": n.get("basis") == "PER_100ML", "categorySlug": p.get("categorySlug")})
        labels.append(grade)
        meta.append(p)
    X = features_frame(rows)
    y = pd.Series(labels, name="grade")

    # Union groups that share a name+brand key or an identical nutrient vector.
    parent: dict[int, int] = {}

    def find(i: int) -> int:
        while parent.setdefault(i, i) != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    first_by_key: dict[str, int] = {}
    for i, p in enumerate(meta):
        n = p["nutrition"]
        vec = "v:" + ",".join(str(n.get(k)) for k in ("energyKcal", "fatG", "saturatedFatG", "carbohydratesG", "sugarsG", "proteinG", "sodiumMg"))
        for key in (_group_key(p), vec):
            if key in first_by_key:
                parent[find(i)] = find(first_by_key[key])
            else:
                first_by_key[key] = i
                find(i)
    groups = pd.Series([find(i) for i in range(len(meta))], name="group")
    stats["usable"] = len(labels)
    return X, y, groups, stats
