"""Experiment runner for the M7 framework.

Executes ONE configuration: builds the browser/context from the spec,
navigates via the requested navigation path, waits the configured session
age, captures evidence (DOM snapshot, console, requests, responses, RPC
bodies, HTML, screenshot), classifies the variant, and writes
variant_report.json plus all artifacts into the run output directory.

The runner NEVER assumes success: navigation errors, launch failures, and
classification failures are all captured in the report with status FAIL /
UNKNOWN and the exception message, and the process continues.
"""

from __future__ import annotations

import json
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

from .classifier import classify
from .context_builder import build_context
from .evidence import EvidenceCollector, dom_snapshot, write_evidence


def _navigation_wait(page, spec) -> None:
    """Navigate per the navigation_path variable; wait session_age seconds."""
    nav = spec.get("navigation_path", "place_id_query")
    url = spec.url
    page.goto(url, timeout=45000, wait_until="load")
    page.wait_for_timeout(int(spec.get("session_age", "6")) * 1000)
    return nav


def run_experiment(spec) -> dict:
    """Run one experiment and return the variant_report dict.

    Never raises for page-level failures: exceptions are recorded in the
    report's ``error`` / ``status`` fields. Only truly fatal framework bugs
    propagate (so a broken experiment cannot silently vanish).
    """
    outdir = spec.outdir
    outdir.mkdir(parents=True, exist_ok=True)

    report: dict = {
        "schema": "variant_report",
        "schema_version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "configuration": spec.to_dict(),
        "status": "RUNNING",
        "variant": "UNKNOWN",
        "confidence": 0.0,
        "reason": "",
        "evidence_paths": {},
        "notes": [],
        "error": None,
    }

    p = None
    browser = None
    context = None
    try:
        with sync_playwright() as p:
            browser, context, warning = build_context(p, spec)
            if warning:
                report["notes"].append(warning)
                report["configuration"]["_run_warning"] = warning
            if spec.get("_skipped_reason"):
                report["notes"].append(spec["_skipped_reason"])
                report["status"] = "NOT_AVAILABLE"
            report["configuration"]["_resolved_skip"] = spec.get("_skipped_reason")

            context.on("dialog", lambda d: d.accept())
            page = context.new_page()
            collector = EvidenceCollector(page)

            try:
                _navigation_wait(page, spec)
            except Exception as e:
                report["status"] = "FAIL"
                report["error"] = f"{type(e).__name__}: {e}"
                report["notes"].append("navigation failed — no classification attempted")
                snapshot = {"unique_ids": 0, "raw_attr": 0, "jftiEf": 0,
                            "role_tab_count": 0, "tabs": []}
            else:
                snapshot = dom_snapshot(page)
                page.screenshot(path=str(outdir / "page.png"), full_page=False)
                (outdir / "page.html").write_text(page.content(), encoding="utf-8")
                write_evidence(outdir, "dom_snapshot.json", snapshot)

            network = collector.drain()
            write_evidence(outdir, "console.json", network["console"])
            write_evidence(outdir, "requests.json", network["requests"])
            write_evidence(outdir, "responses.json", network["responses"])
            write_evidence(outdir, "rpc_bodies.json", network["rpc_bodies"])

            if report["status"] != "FAIL":
                result = classify(snapshot)
                report["variant"] = result["variant"]
                report["confidence"] = result["confidence"]
                report["reason"] = result["reason"]
                report["classification_rules"] = result["rules_applied"]
                if report["status"] != "NOT_AVAILABLE":
                    report["status"] = "OK"

            report["evidence_paths"] = {
                "html": str(outdir / "page.html"),
                "png": str(outdir / "page.png"),
                "dom_snapshot": str(outdir / "dom_snapshot.json"),
                "console": str(outdir / "console.json"),
                "requests": str(outdir / "requests.json"),
                "responses": str(outdir / "responses.json"),
                "rpc_bodies": str(outdir / "rpc_bodies.json"),
            }
            report["snapshot_summary"] = {
                "unique_ids": snapshot.get("unique_ids", 0),
                "raw_attr": snapshot.get("raw_attr", 0),
                "jftiEf": snapshot.get("jftiEf", 0),
                "role_tab_count": snapshot.get("role_tab_count", 0),
                "tabs": snapshot.get("tabs", []),
                "title": snapshot.get("title", ""),
            }
            report["network_summary"] = {
                "requests": len(network["requests"]),
                "responses": len(network["responses"]),
                "console_msgs": len(network["console"]),
                "rpc_bodies": len(network["rpc_bodies"]),
                "review_rpc_qv9Egd_seen": any(
                    "qv9Egd" in (b.get("url", "")) for b in network["rpc_bodies"]),
            }

    except Exception as e:
        report["status"] = "FAIL"
        report["error"] = f"{type(e).__name__}: {e}"
        report["notes"].append(traceback.format_exc(limit=3))
    finally:
        if context:
            try:
                context.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass

    if report["status"] == "RUNNING":
        report["status"] = "FAIL"
        report["error"] = "run ended without status"
    write_evidence(outdir, "variant_report.json", report)
    return report


def main(argv=None) -> int:
    """CLI entry: run one experiment from CLI args.

    Usage:
        python -m variant_framework --url <place_id_url> --outdir <dir> [--variable X --value Y ...]
        python -m variant_framework --matrix --url <place_id_url> --outdir-root <dir>
    """
    import argparse

    ap = argparse.ArgumentParser(prog="variant_framework")
    ap.add_argument("--url", required=True, help="place_id query URL (or full URL)")
    ap.add_argument("--outdir", default="data/variant_experiments/run", help="output directory")
    ap.add_argument("--variable", action="append", default=[],
                    help="variable name (repeatable, e.g. --variable locale --variable timezone)")
    ap.add_argument("--value", action="append", default=[],
                    help="value per --variable (same order)")
    ap.add_argument("--matrix", action="store_true",
                    help="run the full experiment matrix")
    args = ap.parse_args(argv)

    from .spec import VARIABLES, baseline_spec, matrix_specs

    if args.matrix:
        root = Path(args.outdir)
        # Baseline run first: it is the reference for differs_from_baseline
        # in the aggregate report.
        base_out = root / "baseline"
        base_spec = baseline_spec("ChIJOaEQDnk40i0Rzhou4NcRx-w", args.url, base_out)
        base_spec.variables["experiment_label"] = "Baseline (all defaults)"
        print("\n=== Baseline (all defaults) ===", flush=True)
        rep = run_experiment(base_spec)
        print(f"  variant={rep['variant']} conf={rep['confidence']} status={rep['status']}", flush=True)
        specs = matrix_specs("ChIJOaEQDnk40i0Rzhou4NcRx-w", args.url, root)
        for label, spec in specs:
            print(f"\n=== {label} ===", flush=True)
            rep = run_experiment(spec)
            print(f"  variant={rep['variant']} conf={rep['confidence']} status={rep['status']}", flush=True)
        # Aggregate comparison report is part of every matrix run.
        from .reporting import write_aggregate
        agg = write_aggregate(root)
        print(f"\n[aggregate] runs={agg['run_count']} baseline_variant={agg['baseline_variant']} "
              f"-> {root / 'variant_comparison_report.json'}", flush=True)
        return 0

    # Single experiment: build baseline and override the given variables.
    spec = baseline_spec("ChIJOaEQDnk40i0Rzhou4NcRx-w", args.url, Path(args.outdir))
    for name, value in zip(args.variable, args.value):
        if name in VARIABLES:
            spec.variables[name] = value
        else:
            print(f"WARNING: unknown variable {name!r}, ignoring")
    rep = run_experiment(spec)
    print(json.dumps({k: rep[k] for k in ("variant", "confidence", "status", "reason")},
                     indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
