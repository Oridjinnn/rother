#!/usr/bin/env python3
"""Offline verification for the M7 Variant Investigation Framework.

Tests that do NOT require a browser:
  - classifier: deterministic FULL/REDUCED/UNKNOWN rules (the milestone's
    "no ML, document every rule" requirement)
  - spec: baseline defaults, matrix one-variable-per-experiment invariant,
    external-resource skip marking
  - reporting: aggregate comparison report aggregation and correlation notes

Usage:
    python -m tests.verify_variant_framework

Exit codes: 0 = all pass, 1 = any failure.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from variant_framework.classifier import classify
from variant_framework.spec import (VARIABLES, EXPERIMENTS, baseline_spec,
                                   matrix_specs)
from variant_framework.reporting import aggregate_report, write_aggregate

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        msg = f"  [FAIL] {name}"
        if detail:
            msg += f" -- {detail}"
        print(msg)


# ---------------------------------------------------------------------------
# Classifier rules
# ---------------------------------------------------------------------------
def test_classifier() -> None:
    print("\n== classifier rules ==")
    # F1: unique ids present -> FULL 1.0
    r = classify({"unique_ids": 3, "raw_attr": 33, "jftiEf": 3,
                  "role_tab_count": 3, "tabs": ["Ringkasan|Ringkasan",
                                                 "Ulasan untuk Crate Cafe|Ulasan untuk Crate Cafe",
                                                 "Tentang|Tentang"]})
    check("F1 unique_ids>0 -> FULL conf 1.0",
          r["variant"] == "FULL" and r["confidence"] == 1.0, str(r))

    # F2: raw matches only, unique 0 -> FULL 0.5
    r = classify({"unique_ids": 0, "raw_attr": 11, "jftiEf": 0,
                  "role_tab_count": 3, "tabs": []})
    check("F2 raw matches -> FULL conf 0.5",
          r["variant"] == "FULL" and r["confidence"] == 0.5, str(r))

    # F3: reviews tab present, no cards -> FULL 0.6
    r = classify({"unique_ids": 0, "raw_attr": 0, "jftiEf": 0,
                  "role_tab_count": 3, "tabs": ["Ringkasan|Ringkasan",
                                                 "Ulasan untuk Crate Cafe|Ulasan untuk Crate Cafe",
                                                 "Tentang|Tentang"]})
    check("F3 reviews tab -> FULL conf 0.6",
          r["variant"] == "FULL" and r["confidence"] == 0.6, str(r))

    # R1: >=2 tabs, no reviews tab, no cards -> REDUCED 0.9
    r = classify({"unique_ids": 0, "raw_attr": 0, "jftiEf": 0,
                  "role_tab_count": 2, "tabs": ["Ringkasan|Ringkasan",
                                                 "Tentang|Tentang"]})
    check("R1 tabs w/o reviews -> REDUCED conf 0.9",
          r["variant"] == "REDUCED" and r["confidence"] == 0.9, str(r))

    # U1: nothing -> UNKNOWN
    r = classify({"unique_ids": 0, "raw_attr": 0, "jftiEf": 0,
                  "role_tab_count": 0, "tabs": []})
    check("U1 no signals -> UNKNOWN",
          r["variant"] == "UNKNOWN" and r["confidence"] == 0.0, str(r))

    # rules_applied always populated
    r = classify({"unique_ids": 0, "raw_attr": 0, "jftiEf": 0,
                  "role_tab_count": 2, "tabs": ["a|a", "b|b"]})
    check("rules_applied documented", isinstance(r.get("rules_applied"), list)
          and len(r["rules_applied"]) >= 1, str(r))


# ---------------------------------------------------------------------------
# Spec invariants
# ---------------------------------------------------------------------------
def test_spec() -> None:
    print("\n== spec invariants ==")
    spec = baseline_spec("ChIJOaEQDnk40i0Rzhou4NcRx-w",
                         "https://www.google.com/maps/place/Crate+Cafe", Path("/tmp/x"))
    check("baseline has all 13 variables",
          all(k in spec.variables for k in VARIABLES), str(sorted(spec.variables)))
    check("baseline url uses place_id_query",
          spec.url.startswith("https://www.google.com/maps/place/?q=place_id:"),
          spec.url)

    # One independent variable per matrix experiment.
    specs = matrix_specs("ChIJOaEQDnk40i0Rzhou4NcRx-w",
                         "https://www.google.com/maps/place/Crate+Cafe",
                         Path("/tmp/matrix"), available={"ip_class": "http://proxy:8080"})
    check("matrix has one experiment per variable", len(specs) == len(EXPERIMENTS),
          f"{len(specs)} vs {len(EXPERIMENTS)}")
    for label, s in specs:
        base = {k: VARIABLES[k]["default"] for k in VARIABLES}
        changed = [k for k in s.variables if k in VARIABLES and s.variables[k] != base.get(k)]
        check(f"one-var invariant: {label}", len(changed) == 1,
              f"changed={changed}")

    # External resource skip marking.
    specs_skip = matrix_specs("ChIJOaEQDnk40i0Rzhou4NcRx-w",
                              "https://www.google.com/maps/place/Crate+Cafe",
                              Path("/tmp/matrix2"))  # no available -> ip_class skipped
    ip_exp = [s for _, s in specs_skip if s.get("experiment_variable") == "ip_class"]
    check("ip_class marked skipped without proxy",
          ip_exp and ip_exp[0].get("_skipped_reason"), str(ip_exp[0].get("_skipped_reason")))


# ---------------------------------------------------------------------------
# Reporting aggregation
# ---------------------------------------------------------------------------
def test_reporting() -> None:
    print("\n== reporting aggregation ==")
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        base = root / "baseline"
        base.mkdir()
        (base / "variant_report.json").write_text(json.dumps({
            "schema": "variant_report", "timestamp": "2026-08-01T00:00:00Z",
            "configuration": {"url": "u", "outdir": str(base),
                              "locale": "en-US", "viewport": "1366x768"},
            "status": "OK", "variant": "REDUCED", "confidence": 0.9,
            "reason": "REDUCED", "notes": [], "evidence_paths": {},
        }), encoding="utf-8")
        for i, var in enumerate(["locale", "viewport"]):
            d = root / var
            d.mkdir()
            val = "id-ID" if var == "locale" else "390x844"
            (d / "variant_report.json").write_text(json.dumps({
                "schema": "variant_report", "timestamp": "2026-08-01T00:00:01Z",
                "configuration": {"url": "u", "outdir": str(d),
                                  "experiment_variable": var,
                                  "experiment_label": f"{var} test",
                                  var: val, "locale": "en-US" if var == "viewport" else "id-ID",
                                  "viewport": "1366x768" if var == "locale" else "390x844"},
                "status": "OK", "variant": "FULL", "confidence": 1.0,
                "reason": "FULL", "notes": [], "evidence_paths": {},
            }), encoding="utf-8")

        # A run WITHOUT experiment_variable must still be attributed to its
        # differing variable (reporting robustness, not a framework bug).
        d = root / "no_label"
        d.mkdir()
        (d / "variant_report.json").write_text(json.dumps({
            "schema": "variant_report", "timestamp": "2026-08-01T00:00:02Z",
            "configuration": {"url": "u", "outdir": str(d), "locale": "en-US",
                              "viewport": "390x844"},
            "status": "OK", "variant": "FULL", "confidence": 1.0,
            "reason": "FULL", "notes": [], "evidence_paths": {},
        }), encoding="utf-8")

        rep = aggregate_report(root)
        check("aggregate found all 4 runs", rep["run_count"] == 4, str(rep["run_count"]))
        check("baseline variant detected",
              rep["baseline_variant"] == "REDUCED", str(rep["baseline_variant"]))
        # no_label run infers viewport as its variable.
        nl = [r for r in rep["rows"] if r["experiment"] == "baseline" and r["variable"] == "viewport"]
        check("unlabeled run inferred as viewport", len(nl) == 1,
              str([r["variable"] for r in rep["rows"] if r["experiment"] == "baseline"]))
        check("correlation notes present", len(rep["correlations"]) == 2,
              str([c["variable"] for c in rep["correlations"]]))
        write_aggregate(root)
        check("aggregate file written",
              (root / "variant_comparison_report.json").exists())

        # Fictitious classification guard: REPORTING never classifies, it only
        # aggregates stored reports.
        check("aggregate rows carry variant strings",
              all(r["variant"] in ("FULL", "REDUCED", "UNKNOWN") for r in rep["rows"]))

        # NOT_AVAILABLE runs (external resource absent, ran with baseline) must
        # be excluded from correlation counts — otherwise a baseline observation
        # is falsely attributed to a variable that was never exercised.
        base2 = root / "baseline2"
        base2.mkdir()
        (base2 / "variant_report.json").write_text(json.dumps({
            "schema": "variant_report", "timestamp": "2026-08-01T00:00:03Z",
            "configuration": {"url": "u", "outdir": str(base2),
                              "locale": "en-US", "viewport": "1366x768"},
            "status": "OK", "variant": "REDUCED", "confidence": 0.9,
            "reason": "REDUCED", "notes": [], "evidence_paths": {},
        }), encoding="utf-8")
        d = root / "ip_class"
        d.mkdir()
        (d / "variant_report.json").write_text(json.dumps({
            "schema": "variant_report", "timestamp": "2026-08-01T00:00:04Z",
            "configuration": {"url": "u", "outdir": str(d),
                              "experiment_variable": "ip_class",
                              "experiment_label": "IP: residential vs datacenter",
                              "ip_class": "residential", "locale": "en-US",
                              "viewport": "1366x768", "_resolved_skip": "no proxy"},
            "status": "NOT_AVAILABLE", "variant": "REDUCED", "confidence": 0.9,
            "reason": "REDUCED", "notes": ["ip_class=residential requires external proxy"],
            "evidence_paths": {},
        }), encoding="utf-8")

        rep2 = aggregate_report(root)
        ipc = [c for c in rep2["correlations"] if c["variable"] == "ip_class"]
        check("NOT_AVAILABLE run excluded from correlations",
              len(ipc) == 1 and ipc[0]["observed_variants"] == {},
              str(ipc[0]["observed_variants"]))
        check("correlation claim reflects no-testable-observation",
              ipc[0]["claim"].startswith("no difference") or ipc[0]["claim"].startswith("CORRELATION"),
              ipc[0]["claim"])

        # FAIL runs (never produced a real observation) must be excluded too.
        d = root / "auth_fail"
        d.mkdir()
        (d / "variant_report.json").write_text(json.dumps({
            "schema": "variant_report", "timestamp": "2026-08-01T00:00:05Z",
            "configuration": {"url": "u", "outdir": str(d),
                              "experiment_variable": "auth",
                              "experiment_label": "Auth: logged-in vs anonymous",
                              "auth": "logged_in", "locale": "en-US",
                              "viewport": "1366x768"},
            "status": "FAIL", "variant": "UNKNOWN", "confidence": 0.0,
            "reason": "", "notes": ["context creation failed"],
            "evidence_paths": {},
        }), encoding="utf-8")
        rep3 = aggregate_report(root)
        authc = [c for c in rep3["correlations"] if c["variable"] == "auth"]
        check("FAIL run excluded from correlations",
              len(authc) == 1 and authc[0]["observed_variants"] == {},
              str(authc[0]["observed_variants"]))


if __name__ == "__main__":
    test_classifier()
    test_spec()
    test_reporting()
    print(f"\nResults: {PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)
