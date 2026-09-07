"""Shared storage path helpers.

P2 / RISK-024 — tenant scoping. Every on-disk data path is rooted at
``base_data_dir()`` so a single orchestrator process can be pointed at a
per-business data directory via the ``ROTHER_DATA_DIR`` environment variable
(set by the Node ``scrape-runner`` when an active business is selected).

The seed/demo path keeps using the default relative ``data/`` directory; a
scrape for a real user business writes to ``data/users/{business_id}/`` so
two businesses never share snapshots, deltas, or run summaries.
"""

from __future__ import annotations

import os
from pathlib import Path


def base_data_dir() -> Path:
    """Root directory for all runtime data output.

    Honors ``ROTHER_DATA_DIR`` (absolute or relative to the project root /
    cwd). Defaults to the legacy relative ``data`` directory so existing
    behaviour is preserved when the variable is unset.
    """
    return Path(os.environ.get("ROTHER_DATA_DIR", "data"))
