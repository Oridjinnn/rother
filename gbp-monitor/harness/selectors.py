from __future__ import annotations


def resolve_selector(selectors: dict, key: str) -> str | None:
    val = selectors.get(key)
    if isinstance(val, str):
        return val
    if isinstance(val, list) and val:
        return val[0]
    return None


def resolve_selectors(selectors: dict, key: str) -> list[str]:
    val = selectors.get(key)
    if isinstance(val, str):
        return [val]
    if isinstance(val, list):
        return [v for v in val if isinstance(v, str)]
    return []


def selector_count(selectors: dict, key: str) -> int:
    val = selectors.get(key)
    if isinstance(val, str):
        return 1
    if isinstance(val, list):
        return len(val)
    return 0
