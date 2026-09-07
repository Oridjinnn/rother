"""Experiment specification model for the M7 Variant Investigation Framework.

Defines the full set of environmental variables the framework can isolate,
the default baseline configuration, and the experiment matrix (one
independent variable per experiment).

Design rule: every experiment changes EXACTLY ONE variable relative to the
baseline, so any observed variant difference can be attributed to that
variable alone (interaction-testing experiments are listed explicitly and
never bundled silently).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# Variable registry
# ---------------------------------------------------------------------------
# Each entry: name -> (description, options, default)
#   options: list of valid values for the variable (or [] if free-form)
#   default: the value used in the baseline experiment
VARIABLES: dict[str, dict[str, Any]] = {
    "profile": {
        "description": "Fresh (throwaway) vs persistent (reused user-data-dir) browser profile.",
        "options": ["fresh", "persistent"],
        "default": "fresh",
    },
    "auth": {
        "description": "Anonymous vs logged-in Google account (via a storage_state file).",
        "options": ["anonymous", "logged_in"],
        "default": "anonymous",
    },
    "ip_class": {
        "description": "Datacenter vs residential egress IP. Residential requires an "
                       "external proxy; without one the variable is recorded as "
                       "NOT_AVAILABLE and the run proceeds over the default egress.",
        "options": ["datacenter", "residential"],
        "default": "datacenter",
    },
    "locale": {
        "description": "Google Maps UI locale (context.locale).",
        "options": ["en-US", "id-ID", "de-DE"],
        "default": "en-US",
    },
    "browser_language": {
        "description": "Accept-Language header (browser language).",
        "options": ["en-US,en;q=0.9", "id-ID,id;q=0.9", "de-DE,de;q=0.9"],
        "default": "en-US,en;q=0.9",
    },
    "timezone": {
        "description": "Context timezone_id.",
        "options": ["Asia/Makassar", "America/New_York", "Europe/Berlin", "UTC"],
        "default": "Asia/Makassar",
    },
    "viewport": {
        "description": "Viewport size as WxH.",
        "options": ["1366x768", "1920x1080", "390x844", "1024x768"],
        "default": "1366x768",
    },
    "browser_version": {
        "description": "Chrome version claimed by UA + client-hints brands.",
        "options": ["124", "120", "128"],
        "default": "124",
    },
    "chrome_channel": {
        "description": "Chromium launch channel (bundled chromium vs system chrome).",
        "options": ["chromium", "chrome"],
        "default": "chromium",
    },
    "headed": {
        "description": "Headless vs headed Chromium.",
        "options": ["headless", "headed"],
        "default": "headless",
    },
    "navigation_path": {
        "description": "How the listing page is reached.",
        "options": ["place_id_query", "full_place_url", "search"],
        "default": "place_id_query",
    },
    "session_age": {
        "description": "Seconds to wait after load before the classification snapshot.",
        "options": ["0", "6", "15", "30"],
        "default": "6",
    },
    "cookies": {
        "description": "Presence of pre-seeded cookies (from a cookies file).",
        "options": ["none", "seed"],
        "default": "none",
    },
}

# The ONE variable every experiment may vary. Used for validation only.
_EXPERIMENT_VARIABLE = "variable"


@dataclass
class ExperimentSpec:
    """A fully-resolved experiment configuration.

    ``variables`` holds the resolved value for every key in VARIABLES, PLUS
    two framework-level keys: ``url`` (the target listing URL) and
    ``outdir`` (absolute output directory). Keeping the spec a flat dict
    makes it trivially serialisable into variant_report.json.
    """

    variables: dict[str, Any] = field(default_factory=dict)

    # -- convenience accessors -----------------------------------------
    def get(self, key: str, default: Any = None) -> Any:
        return self.variables.get(key, default)

    def __getitem__(self, key: str) -> Any:
        return self.variables[key]

    def to_dict(self) -> dict[str, Any]:
        return dict(self.variables)

    @property
    def url(self) -> str:
        return self.variables.get("url", "")

    @property
    def outdir(self) -> Path:
        return Path(self.variables["outdir"])


# ---------------------------------------------------------------------------
# Baseline spec factory
# ---------------------------------------------------------------------------
def _resolve_url(navigation_path: str, place_id: str, full_url: str) -> str:
    """Build the target URL from the navigation-path variable.

    ``place_id`` is the canonical ``place_id:ChIJ...`` value; ``full_url`` is
    the fully-expanded Google Maps place URL. Both are supplied by the
    runner's --place-id / --url options.
    """
    if navigation_path == "full_place_url":
        return full_url
    if navigation_path == "search":
        # Search-first navigation: land on Maps search results, then let the
        # experiment click the top result (see runner nav logic). The URL here
        # is the search URL for the place's name.
        return "https://www.google.com/maps/search/Place+Name"
    # default: place_id_query
    return f"https://www.google.com/maps/place/?q=place_id:{place_id}"


def baseline_spec(
    place_id: str,
    full_url: str,
    outdir: Path,
    extra: dict[str, Any] | None = None,
) -> ExperimentSpec:
    """Return the baseline experiment spec (production-like hardened context)."""
    vars_ = {name: meta["default"] for name, meta in VARIABLES.items()}
    vars_["url"] = _resolve_url(vars_["navigation_path"], place_id, full_url)
    vars_["outdir"] = str(outdir)
    vars_.update(extra or {})
    return ExperimentSpec(variables=vars_)


# ---------------------------------------------------------------------------
# Experiment matrix
# ---------------------------------------------------------------------------
# Each experiment changes ONE variable. ``variable`` names the key,
# ``value`` is the test value, ``label`` is the human title, ``note``
# explains what correlation it probes.
EXPERIMENTS: list[dict[str, Any]] = [
    {"variable": "profile", "value": "persistent", "label": "Profile: persistent vs fresh",
     "note": "Does reusing a user-data-dir across runs correlate with the FULL variant?"},
    {"variable": "auth", "value": "logged_in", "label": "Auth: logged-in vs anonymous",
     "note": "Does presenting a logged-in Google account correlate with FULL?"},
    {"variable": "ip_class", "value": "residential", "label": "IP: residential vs datacenter",
     "note": "Does a residential egress IP correlate with FULL? Requires external proxy."},
    {"variable": "locale", "value": "id-ID", "label": "Locale: id-ID vs en-US",
     "note": "Does UI locale correlate with the variant?"},
    {"variable": "browser_language", "value": "id-ID,id;q=0.9", "label": "Language: Indonesian vs English",
     "note": "Does the Accept-Language header correlate with the variant?"},
    {"variable": "timezone", "value": "America/New_York", "label": "Timezone: NY vs Makassar",
     "note": "Does timezone_id correlate with the variant?"},
    {"variable": "viewport", "value": "390x844", "label": "Viewport: mobile vs desktop",
     "note": "Does a mobile-sized viewport correlate with the variant?"},
    {"variable": "browser_version", "value": "128", "label": "Chrome version: 128 vs 124",
     "note": "Does the claimed Chrome version correlate with the variant?"},
    {"variable": "chrome_channel", "value": "chrome", "label": "Channel: system chrome vs bundled chromium",
     "note": "Does running real Chrome correlate with the variant? Requires Chrome installed."},
    {"variable": "headed", "value": "headed", "label": "Headless vs headed",
     "note": "Does headed mode correlate with the variant?"},
    {"variable": "navigation_path", "value": "full_place_url", "label": "Navigation: full URL vs place_id query",
     "note": "Does how the page is reached correlate with the variant?"},
    {"variable": "session_age", "value": "30", "label": "Session age: 30s vs 6s",
     "note": "Does a longer pre-snapshot wait correlate with the variant?"},
    {"variable": "cookies", "value": "seed", "label": "Cookies: seeded vs none",
     "note": "Does pre-seeded cookies correlate with the variant?"},
]


def matrix_specs(
    place_id: str,
    full_url: str,
    outdir_root: Path,
    available: dict[str, Any] | None = None,
) -> list[tuple[str, ExperimentSpec]]:
    """Return (label, spec) for every experiment in the matrix.

    ``available`` may supply externally-provided resources (e.g. a proxy URL
    for ``ip_class``), keyed by variable name. Variables that cannot be
    materialised (e.g. no proxy) are recorded in the spec as
    ``_skipped_reason`` and the run is marked NOT_AVAILABLE instead of
    silently faking them.
    """
    available = available or {}
    out: list[tuple[str, ExperimentSpec]] = []
    for exp in EXPERIMENTS:
        var = exp["variable"]
        outdir = outdir_root / exp["label"].split(":")[0].lower().replace(" ", "_")
        spec = baseline_spec(place_id, full_url, outdir)
        spec.variables[var] = exp["value"]
        spec.variables["experiment_label"] = exp["label"]
        spec.variables["experiment_note"] = exp["note"]
        spec.variables["experiment_variable"] = var
        if var in ("ip_class", "chrome_channel", "auth", "cookies") and var not in available:
            spec.variables["_skipped_reason"] = (
                f"{var}={exp['value']!r} requires external resource not provided; "
                "recorded NOT_AVAILABLE, run proceeds with baseline value."
            )
        out.append((exp["label"], spec))
    return out
