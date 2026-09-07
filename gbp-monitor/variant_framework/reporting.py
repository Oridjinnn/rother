"""Aggregate comparison report for the M7 framework.

Scans a directory of experiment run outputs (each containing
variant_report.json) and produces a table:

    Experiment | Variable | Value | Variant | Confidence | Notes

It also flags variables that show a consistent variant difference vs the
baseline. This is a CORRELATION report only — it never claims causation
(the milestone forbids unsupported causal conclusions).
"""

from __future__ import annotations

import json
from pathlib import Path

from .classifier import classify
from .spec import VARIABLES


def _load_report(outdir: Path) -> dict | None:
    rp = outdir / "variant_report.json"
    if not rp.exists():
        return None
    try:
        return json.loads(rp.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _infer_variable(cfg: dict) -> str | None:
    """If experiment_variable is missing, infer it by diffing cfg against
    VARIABLES defaults. Returns the differing variable name or None.
    """
    for name, meta in VARIABLES.items():
        default = meta["default"]
        if cfg.get(name) is not None and cfg.get(name) != default:
            return name
    return None


def _is_baseline(report: dict) -> bool:
    cfg = report.get("configuration", {})
    if not cfg.get("experiment_variable"):
        # Only treated as baseline when NO variable differs from defaults.
        return _infer_variable(cfg) is None
    return False


def find_runs(root: Path) -> list[dict]:
    """Return every variant_report.json under *root* (recursive)."""
    runs = []
    for rp in sorted(root.rglob("variant_report.json")):
        rep = _load_report(rp.parent)
        if rep:
            runs.append(rep)
    return runs


def aggregate_report(root: Path) -> dict:
    """Build the aggregate comparison report across all runs under *root*."""
    runs = find_runs(root)
    baseline: dict | None = None
    rows: list[dict] = []
    variable_rows: dict[str, list[dict]] = {}

    for rep in runs:
        cfg = rep.get("configuration", {})
        var = cfg.get("experiment_variable") or _infer_variable(cfg)
        row = {
            "experiment": cfg.get("experiment_label", "baseline"),
            "variable": var or "baseline",
            "value": cfg.get(var) if var else "(default)",
            "variant": rep.get("variant", "UNKNOWN"),
            "confidence": rep.get("confidence", 0.0),
            "status": rep.get("status", "?"),
            "notes": "; ".join(rep.get("notes", []))[:200] or rep.get("reason", ""),
            "run_dir": str(rep.get("evidence_paths", {}).get("html", ""))
                       .split("variant_experiments")[-1] if rep.get("evidence_paths") else "",
            "timestamp": rep.get("timestamp", ""),
        }
        rows.append(row)
        if row["variable"] == "baseline":
            baseline = rep
        else:
            variable_rows.setdefault(row["variable"], []).append(row)

    # Correlation note: for each non-baseline variable, compare its runs'
    # variants to the baseline's variant. NOT_AVAILABLE runs (proceeded with
    # the baseline value) and FAIL runs (never produced a real observation)
    # are excluded: counting either would attribute a non-test observation to
    # a variable that was never actually exercised.
    correlations = []
    base_variant = baseline.get("variant", "UNKNOWN") if baseline else None
    for var, vrows in variable_rows.items():
        counts: dict[str, int] = {}
        for r in vrows:
            if r["status"] in ("NOT_AVAILABLE", "FAIL"):
                continue
            counts[r["variant"]] = counts.get(r["variant"], 0) + 1
        if base_variant is None:
            claim = "no baseline run available — correlations undetermined"
        else:
            differs = any(v != base_variant for v in counts)
            claim = ("CORRELATION observed — verify with repeats before interpreting"
                     if differs else "no difference observed in this sample")
        correlations.append({
            "variable": var,
            "baseline_variant": base_variant,
            "observed_variants": counts,
            "differs_from_baseline": differs if base_variant else None,
            "claim": claim,
        })

    return {
        "schema": "variant_comparison_report",
        "schema_version": "1.0",
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(),
        "run_count": len(runs),
        "baseline_variant": base_variant,
        "rows": rows,
        "correlations": correlations,
    }


def write_aggregate(root: Path) -> dict:
    rep = aggregate_report(root)
    (root / "variant_comparison_report.json").write_text(
        json.dumps(rep, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    return rep


def _classify_for_test(snapshot: dict) -> str:
    """Thin wrapper so offline tests can classify without a browser."""
    return classify(snapshot)["variant"]
