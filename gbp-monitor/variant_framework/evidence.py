"""Evidence collection for the M7 framework.

Collects, per run:
  - DOM snapshot (review cards, tabs, variant-relevant counts)
  - page title / URL
  - browser console log
  - request log (XHR/fetch + navigation)
  - response log (status per URL)
  - batchexecute RPC detection (qv9Egd review RPC fingerprint, M6 finding)
All evidence is written to the run output directory as JSON artifacts plus
an HTML snapshot and a PNG screenshot.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from playwright.sync_api import Page


def dom_snapshot(page: Page) -> dict:
    """Collect the deterministic variant evidence from the live DOM."""
    return page.evaluate(
        """() => {
            const raw = document.querySelectorAll('[data-review-id]');
            const ids = new Set();
            for (const el of raw) {
                const id = el.getAttribute('data-review-id');
                if (id) ids.add(id);
            }
            const cards = document.querySelectorAll('div.jftiEf');
            const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
            return {
                unique_ids: ids.size,
                distinct_ids: Array.from(ids).slice(0, 80),
                raw_attr: raw.length,
                jftiEf: cards.length,
                role_tab_count: tabs.length,
                tabs: tabs.map(t => (t.getAttribute('aria-label') || '') + '|' +
                                     (t.textContent || '').trim().slice(0, 40)).slice(0, 15),
                review_feed: document.querySelectorAll('[role="feed"]').length,
                body_h: document.body ? document.body.scrollHeight : 0,
                doc_h: document.documentElement.scrollHeight,
                doc_scroll_top: document.documentElement.scrollTop || document.body.scrollTop || 0,
                iframes: document.querySelectorAll('iframe').length,
                dialogs: document.querySelectorAll('[role="dialog"]').length,
                title: document.title,
            };
        }"""
    )


class EvidenceCollector:
    """Passive listeners attached to the page before navigation.

    Buffers console messages, requests, responses, and batchexecute RPC
    bodies. ``drain()`` returns them and resets the buffer.
    """

    def __init__(self, page: Page):
        self.page = page
        self.console: list[dict] = []
        self.requests: list[dict] = []
        self.responses: list[dict] = []
        self.rpc_bodies: list[dict] = []
        self.start_wall = time.time()

        page.on("console", self._on_console)
        page.on("request", self._on_request)
        page.on("response", self._on_response)

    def _ts(self) -> str:
        return time.strftime("%H:%M:%S", time.gmtime())

    def _on_console(self, msg) -> None:
        self.console.append({"t": self._ts(), "type": msg.type, "text": msg.text[:300]})

    def _on_request(self, req) -> None:
        if req.resource_type in ("xhr", "fetch", "document"):
            self.requests.append({"t": self._ts(), "kind": "request",
                                  "type": req.resource_type, "url": req.url[:240],
                                  "method": req.method})

    def _on_response(self, resp) -> None:
        req = resp.request
        if req.resource_type in ("xhr", "fetch", "document"):
            self.responses.append({"t": self._ts(), "kind": "response",
                                   "type": req.resource_type, "url": req.url[:240],
                                   "status": resp.status})
            if "batchexecute" in req.url:
                try:
                    body = resp.text()
                    if body:
                        self.rpc_bodies.append({
                            "t": self._ts(),
                            "url": req.url[:260],
                            "status": resp.status,
                            "body_prefix": body[:300],
                            "has_review_keywords": any(
                                k in body for k in ("data-review-id", "Gkqea", "qv9Egd",
                                                    "jftiEf", "review", "PJ5Fof")),
                        })
                except Exception:
                    pass

    def drain(self) -> dict:
        d = {
            "console": self.console,
            "requests": self.requests,
            "responses": self.responses,
            "rpc_bodies": self.rpc_bodies,
        }
        self.console, self.requests, self.responses, self.rpc_bodies = [], [], [], []
        return d

    def elapsed_s(self) -> float:
        return round(time.time() - self.start_wall, 1)


def write_evidence(outdir: Path, name: str, data) -> None:
    (outdir / name).write_text(
        json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
