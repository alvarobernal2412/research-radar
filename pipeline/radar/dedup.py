"""Duplicate detection and stable ids for paper records.

The same paper usually turns up in several sources (OpenAlex, DBLP, the
publisher, arXiv). Records are matched on
  1. the DOI, lower-cased and without the https://doi.org/ prefix, then
  2. the normalised title + first author's surname + year,
and merged into one record whose ``foundIn`` lists every source.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable

from .openalex import normalize_doi

_PUNCT = re.compile(r"[^a-z0-9]+")


def fold(text: str | None) -> str:
    """Lower-case, strip accents and punctuation, collapse spaces."""
    t = unicodedata.normalize("NFD", text or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return _PUNCT.sub(" ", t).strip()


def surname(name: str | None) -> str:
    parts = fold(name).split()
    return parts[-1] if parts else ""


def keys(rec: dict) -> list[str]:
    out = []
    doi = normalize_doi(rec.get("doi"))
    if doi:
        out.append("doi:" + doi)
    authors = rec.get("authors") or []
    first = authors[0] if authors else {}
    first_name = first if isinstance(first, str) else first.get("name")
    title = fold(rec.get("title"))
    if title:
        out.append(f"t:{title}|{surname(first_name)}|{rec.get('year') or ''}")
    return out


def paper_id(rec: dict) -> str:
    """Stable document id: the DOI slug, else title + year (max 80 chars)."""
    doi = normalize_doi(rec.get("doi"))
    base = doi if doi else f"{fold(rec.get('title'))} {rec.get('year') or ''}"
    return _PUNCT.sub("-", base.lower()).strip("-")[:80].rstrip("-")


_LIST_UNION = ("foundIn", "keywords")


def merge(a: dict, b: dict) -> dict:
    """Merge b into a: keep a's values, fill gaps from b, union source lists.

    A full-text analysis always wins over an abstract-only one.
    """
    if b.get("fullTextRead") and not a.get("fullTextRead"):
        a, b = b, a
    out = dict(a)
    for k, v in b.items():
        if k in _LIST_UNION:
            out[k] = list(dict.fromkeys([*(a.get(k) or []), *(v or [])]))
        elif out.get(k) in (None, "", []) and v not in (None, "", []):
            out[k] = v
    return out


def dedupe(records: Iterable[dict]) -> list[dict]:
    merged: list[dict] = []
    index: dict[str, int] = {}
    for rec in records:
        hit = next((index[k] for k in keys(rec) if k in index), None)
        if hit is None:
            merged.append(dict(rec))
            hit = len(merged) - 1
        else:
            merged[hit] = merge(merged[hit], rec)
        for k in keys(merged[hit]):
            index[k] = hit
    return merged
