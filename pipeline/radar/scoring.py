"""Affinity and completeness rules shared by the scan and the site.

The site (site/src/js/22-completeness.js) implements the same completeness
rules in JavaScript; keep the two in step.
"""
from __future__ import annotations

from typing import Mapping

MIN_AFFINITY = 35


def affinity(theme_scores: Mapping[str, float], topic: Mapping, exclude_hit: bool = False) -> dict:
    """Combine per-theme scores (0-100) into one affinity score.

    Each theme score says how central that theme is to the paper:
    100 = its main subject, 50 = a substantial part, 20 = mentioned, 0 = absent.
    v_i = score_i * weight_i;  affinity = 0.6 * max(v) + 0.4 * mean(top three v).
    A paper that is mainly about an excluded topic loses 20 points.
    """
    weights = {t["name"]: float(t.get("weight", 1) or 0) for t in topic.get("themes", [])}
    v = sorted((max(0.0, min(100.0, float(s))) * weights.get(name, 0.0) for name, s in theme_scores.items()), reverse=True)
    if not v:
        score = 0
    else:
        top3 = v[:3]
        score = 0.6 * v[0] + 0.4 * (sum(top3) / len(top3))
    if exclude_hit:
        score -= 20
    score = int(round(max(0, min(100, score))))
    ranked = sorted(((n, s) for n, s in theme_scores.items() if s >= 20), key=lambda x: -x[1])
    return {
        "affinity": score,
        "affinityBreakdown": [{"theme": n, "score": round(s)} for n, s in ranked],
        "themes": [n for n, s in ranked if s >= 50],
        "scoredTopicRevision": int(topic.get("revision") or 1),
    }


def completeness(p: Mapping) -> dict:
    """Same levels as the site: complete / partial / minimal."""
    issues = []
    not_read = p.get("fullTextRead") is not True
    if p.get("pendingDetail"):
        issues.append("pending analysis")
    if not p.get("abstract"):
        issues.append("no abstract")
    if not_read:
        issues.append("full text not read")
    if not p.get("summary") and not p.get("contribution"):
        issues.append("no summary")
    if p.get("pendingDetail") or (not p.get("abstract") and not p.get("summary")):
        level = "minimal"
    elif not_read or not p.get("abstract") or (not p.get("summary") and not p.get("contribution")):
        level = "partial"
    else:
        level = "complete"
    return {"level": level, "issues": issues}


def normalize_stated_fields(p: dict) -> dict:
    """Author-stated fields are unknown (None) unless the full text was read.

    Older records stored [] for "not available"; that reads as "the authors
    state none", which is wrong when the paper was never read.
    """
    if p.get("fullTextRead") is not True:
        for k in ("limitationsStated", "futureWork"):
            if p.get(k) == []:
                p[k] = None
    return p
