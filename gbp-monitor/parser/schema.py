"""Single source of truth for the Review record shape.

Per GBP_MONITOR_PLAN.md Section 5.1, every module that needs to represent a
review MUST import `Review` from here rather than redefining its own ad-hoc
shape. This is what keeps the parser, storage, delta, and orchestration
layers (and the future Next.js dashboard) in sync on field names and types.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass
class Review:
    review_id: str
    competitor_id: str
    branch_id: str
    reviewer_name: str | None
    rating: float | None
    text: str | None
    relative_date: str | None
    scraped_at: str  # ISO 8601, UTC preferred
    owner_response: str | None = None  # Business owner's public reply, if any.


def review_to_dict(review: Review) -> dict:
    """Serialize a `Review` to a plain dict (for JSON storage).

    Uses `dataclasses.asdict` so nested dataclasses (if ever added) are
    handled correctly. Kept here next to the schema so callers do not
    reach into `review.__dict__` directly, which couples them to the
    dataclass implementation.
    """
    return asdict(review)
