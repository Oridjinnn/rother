"""M7 Variant Investigation Framework.

Experimental framework (NOT a scraping/parser/instrumentation milestone) whose
sole objective is determining WHY Google serves either the FULL or REDUCED
review experience. Produces structured evidence per run and aggregate
comparison reports. See docs/validation/M7_VARIANT_INVESTIGATION_FRAMEWORK.md.
"""

from .spec import VARIABLES, EXPERIMENTS, baseline_spec, matrix_specs, ExperimentSpec
from .classifier import classify
from .runner import run_experiment
from .reporting import aggregate_report, write_aggregate, find_runs

__all__ = [
    "VARIABLES",
    "EXPERIMENTS",
    "baseline_spec",
    "matrix_specs",
    "ExperimentSpec",
    "classify",
    "run_experiment",
    "aggregate_report",
    "write_aggregate",
    "find_runs",
]
