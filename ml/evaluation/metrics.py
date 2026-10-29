"""Evaluation metrics and the human-readable evaluation report."""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

from preprocessing.features import GRADES


def classification_metrics(y_true, y_pred) -> dict[str, Any]:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=GRADES, zero_division=0)
    pm, rm, fm, _ = precision_recall_fscore_support(y_true, y_pred, labels=GRADES, average="macro", zero_division=0)
    pw, rw, fw, _ = precision_recall_fscore_support(y_true, y_pred, labels=GRADES, average="weighted", zero_division=0)
    idx = {g: i for i, g in enumerate(GRADES)}
    within_one = float(np.mean([abs(idx[a] - idx[b]) <= 1 for a, b in zip(y_true, y_pred)]))
    return {
        "n": int(len(y_true)),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macro_precision": round(float(pm), 4),
        "macro_recall": round(float(rm), 4),
        "macro_f1": round(float(fm), 4),
        "weighted_f1": round(float(fw), 4),
        "within_one_grade": round(within_one, 4),
        "per_class": {
            g: {"precision": round(float(p[i]), 4), "recall": round(float(r[i]), 4), "f1": round(float(f[i]), 4), "support": int(s[i])}
            for i, g in enumerate(GRADES)
        },
        "confusion_matrix": {"labels": GRADES, "rows_true_cols_pred": confusion_matrix(y_true, y_pred, labels=GRADES).tolist()},
    }


def render_report(meta: dict[str, Any]) -> str:
    t = meta["metrics"]["test"]
    b = meta["metrics"]["majorityClassBaseline"]
    d = meta["metrics"]["dataset"]
    split = meta["config"]["split"]
    cm = t["confusion_matrix"]["rows_true_cols_pred"]
    lines = [
        f"# ML evaluation report - {meta['modelVersion']}",
        "",
        "> Experimental model. It estimates the **Open Food Facts Nutri-Score grade** (a published reference label) from label nutrients.",
        "> It is not the INR rating, not a validation of the INR methodology, and these metrics say nothing about medical or nutritional validity.",
        "",
        "## Data",
        "",
        f"* Products in the cleaned file: {d['total']}; with an OFF Nutri-Score grade: {d['with_reference_grade']}; usable after excluding unknown basis ({d['excluded_basis_unknown']}) and missing core nutrients ({d['excluded_no_core']}): **{d['usable']}**.",
        f"* Class distribution: {', '.join(f'{g.upper()}={n}' for g, n in meta['metrics']['classDistribution'].items())}.",
        f"* Split (grouped by product name/brand and identical nutrient vectors): train {split['train']}, validation {split['validation']}, test {split['test']}.",
        f"* Selected parameters (by validation macro-F1): `{meta['config']['bestParams']}`.",
        "",
        "## Test-set results (evaluated once, after model selection)",
        "",
        "| Metric | Random Forest | Majority-class baseline |",
        "|---|---|---|",
        f"| Accuracy | {t['accuracy']:.3f} | {b['accuracy']:.3f} |",
        f"| Macro precision | {t['macro_precision']:.3f} | {b['macro_precision']:.3f} |",
        f"| Macro recall | {t['macro_recall']:.3f} | {b['macro_recall']:.3f} |",
        f"| Macro F1 | {t['macro_f1']:.3f} | {b['macro_f1']:.3f} |",
        f"| Weighted F1 | {t['weighted_f1']:.3f} | {b['weighted_f1']:.3f} |",
        f"| Within one grade | {t['within_one_grade']:.3f} | {b['within_one_grade']:.3f} |",
        "",
        *(
            [
                f"Grouped 7-fold cross-validation with the selected parameters: accuracy {meta['metrics']['groupedCrossValidation7Fold']['summary']['accuracy']['mean']:.3f} ± {meta['metrics']['groupedCrossValidation7Fold']['summary']['accuracy']['std']:.3f}, "
                f"macro-F1 {meta['metrics']['groupedCrossValidation7Fold']['summary']['macro_f1']['mean']:.3f} ± {meta['metrics']['groupedCrossValidation7Fold']['summary']['macro_f1']['std']:.3f}, "
                f"within one grade {meta['metrics']['groupedCrossValidation7Fold']['summary']['within_one_grade']['mean']:.3f} ± {meta['metrics']['groupedCrossValidation7Fold']['summary']['within_one_grade']['std']:.3f} "
                "(slightly optimistic because parameters were selected on one of the folds).",
                "",
            ]
            if "groupedCrossValidation7Fold" in meta["metrics"]
            else []
        ),
        "### Per class (test)",
        "",
        "| Grade | Precision | Recall | F1 | Support |",
        "|---|---|---|---|---|",
        *[f"| {g.upper()} | {v['precision']:.3f} | {v['recall']:.3f} | {v['f1']:.3f} | {v['support']} |" for g, v in t["per_class"].items()],
        "",
        "### Confusion matrix (rows = true grade, columns = predicted)",
        "",
        "| | " + " | ".join(g.upper() for g in GRADES) + " |",
        "|---|" + "---|" * len(GRADES),
        *[f"| **{GRADES[i].upper()}** | " + " | ".join(str(c) for c in row) + " |" for i, row in enumerate(cm)],
        "",
        "## Global feature importance (impurity-based)",
        "",
        "These describe what the model relies on; they are associations, not causal effects.",
        "",
        "| Feature | Importance |",
        "|---|---|",
        *[f"| {r['feature']} | {r['importance']:.4f} |" for r in meta["metrics"]["topImportances"]],
        "",
        "## Limitations",
        "",
        "* Nutri-Score is itself computed by an algorithm from nutrients, fruit/vegetable/legume content and category; the model approximates that reference from incomplete label data (no fruit/vegetable percentage), so agreement is bounded.",
        "* Open Food Facts data are crowd-sourced; some grades and nutrient values are wrong.",
        "* Only India-tagged products from one snapshot were used; performance on other products is unknown.",
        "",
    ]
    return "\n".join(lines)
