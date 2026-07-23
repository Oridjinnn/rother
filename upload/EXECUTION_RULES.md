# GBP-Monitor Execution Rules

These rules are binding for all development on the GBP Competitor Review
Monitor (Copenhagen Bali project). They exist to prevent technical debt,
hallucinated progress, and lost context across sessions. Any AI coding agent
(including z.ai GLM 5.2) working on this codebase MUST follow these rules.
Violation of any rule means the change is NOT complete, regardless of what
was claimed.

---

## Rule 1 — Definition of Success

A change is ONLY a success when it passes ALL of the following:

- **Tested**: there is a runnable test or manual verification step that
  exercises the change against real or realistic input (not just "the code
  looks correct").
- **Fully implemented**: no placeholder function, no `TODO` marketed as done,
  no selector left as `"PLACEHOLDER_PERLU_VERIFIKASI"` in a change claimed as
  finished.
- **Retested**: after the change, run the relevant script
  (`python orchestration/run_all.py` or a scoped test) and confirm it still
  runs end-to-end without unhandled exceptions.
- **Verified**: the actual output (log file, snapshot JSON, review count) is
  read and compared against what was expected — not assumed.

Anything short of this is an **UNPROVEN implementation**. It must be labeled
as such in the changelog (see Rule 2), never labeled as "done" or "complete."

---

## Rule 2 — Change Record (Checkpoint Log)

Every change MUST be recorded in `CHANGELOG.md` at the moment it is made
(not batched, not written from memory afterward). Each entry MUST include:

- Timestamp (ISO 8601).
- Exact file path(s) and what changed (function name, selector key, etc).
- Why the change was made (what problem it fixes or what it adds).
- Status: `PROVEN` (passed Rule 1 in full) or `UNPROVEN` (attempted but not
  fully verified — must state exactly what's missing).

This log is the project's memory across sessions. If a session ends and a
new one begins, the first action is to read `CHANGELOG.md`, not to guess
the current state of the code.

---

## Rule 3 — No Fabricated Claims About External Systems

This project scrapes Google Maps, a system outside our control that we do
not have ground-truth documentation for. The agent MUST NOT claim a
selector, DOM structure, or Google Maps behavior is correct without having
actually observed it (via browser inspection, a captured HTML sample, or a
failed/passed run log). If the agent has not verified something against
real output, it must say so explicitly — "assumed, not verified" — rather
than presenting a guess as fact.

This extends to library APIs (Playwright, Scrapy, Spider): if unsure whether
a method/parameter exists as described, verify against the installed
package's actual interface before using it, not from memory alone.

---

## Rule 4 — Immutable Scope & Zero-Cost Constraint

NEVER introduce a paid API, paid proxy service, or paid scraping service
(Firecrawl, Bright Data, ScraperAPI, etc.) into this codebase without
explicit, separate approval. The entire point of this architecture
(Playwright + Scrapy + Spider, self-hosted, GitHub Actions free tier) is
**zero recurring cost**. Any dependency that requires a paid API key is an
out-of-scope change and must be flagged, not silently added.

NEVER implement AI/LLM-based features (sentiment analysis, auto-reply,
summarization) in this phase. AI integration is explicitly deferred until
the client requests it — see `GBP_MONITOR_PLAN.md` Section 1. Adding an LLM
call "because it would help" is a scope violation.

---

## Rule 5 — No Shortcuts, No Fake Progress

Marking a function as implemented when it only returns mock/hardcoded data
is a failed execution. Marking a selector as verified when it was only
copied from a 2023 reference repo without checking against current Google
Maps DOM is a failed execution — it must be labeled `UNPROVEN` per Rule 2
until actually checked.

A slow, correctly-verified step is worth more than a fast unverified one.

---

## Rule 6 — Selector Changes Are High-Risk, Log Them Specially

Because Google Maps' DOM structure changes without notice, every change to
`config/selectors.json` MUST include in the changelog:
- Which field changed (e.g. `review_container`).
- Old value → new value.
- What evidence triggered the change (a failed run log, a manual DOM
  inspection, etc).
- Updated `last_verified` date and `verified_by` (`"seed"`,
  `"browser_agent"`, or `"manual_human"`) inside `selectors.json` itself.

---

## Rule 7 — Failure Isolation Is Mandatory, Not Optional

Per the architecture defined in `GBP_MONITOR_PLAN.md`, one competitor
listing failing to scrape must NEVER stop the whole run. If an agent's
implementation causes one failure to crash the entire `run_all.py` process,
that is a Rule 1 failure (not fully implemented), regardless of how much
other code was written correctly.

---

## Rule 8 — Tests/Fixtures Are the Standard, Never the Target

If a verification step (a sample HTML fixture, an expected review count)
fails after a change, the FAILURE is in the code, not in the fixture.
Do not loosen a fixture, delete a check, or lower a threshold to make a
failing change appear to pass. Fix the code so it meets the existing
standard.

---

## Rule 9 — Documentation Is Part Of The Change, Not An Afterthought

A change without an updated `CHANGELOG.md` entry does not count as
delivered, even if the code itself works. Documentation and code are
submitted together, in the same work unit.
