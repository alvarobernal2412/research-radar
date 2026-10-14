"""Minimal OpenAlex client (standard library only).

OpenAlex (https://openalex.org) indexes most scholarly works with open
metadata and abstracts, so it is the first source the scan uses: it avoids
scraping sites that block automated access. An API key raises the rate limits;
pass it as ``api_key`` or set OPENALEX_API_KEY. Never commit a key.

Command line:

    python -m radar.openalex search "analytic provenance process mining" --since 2023-10-13 --max 50
    python -m radar.openalex doi 10.1234/example.1

Both print paper records in the site's schema (one JSON object per line).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterator

BASE = "https://api.openalex.org"
WORK_FIELDS = (
    "id,doi,display_name,publication_year,publication_date,type,type_crossref,"
    "primary_location,best_oa_location,open_access,authorships,cited_by_count,"
    "abstract_inverted_index,keywords,topics"
)


class OpenAlexError(RuntimeError):
    pass


class OpenAlex:
    def __init__(self, api_key: str | None = None, mailto: str | None = None, base: str = BASE,
                 timeout: float = 30.0, retries: int = 3):
        self.api_key = api_key if api_key is not None else os.environ.get("OPENALEX_API_KEY")
        self.mailto = mailto if mailto is not None else os.environ.get("OPENALEX_MAILTO")
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.retries = retries

    def url(self, path: str, params: dict[str, Any] | None = None) -> str:
        q = {k: v for k, v in (params or {}).items() if v is not None}
        if self.api_key:
            q["api_key"] = self.api_key
        if self.mailto:
            q["mailto"] = self.mailto
        return f"{self.base}/{path.lstrip('/')}" + ("?" + urllib.parse.urlencode(q) if q else "")

    def get(self, path: str, params: dict[str, Any] | None = None) -> dict:
        url = self.url(path, params)
        delay = 1.0
        for attempt in range(self.retries + 1):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "research-radar/1.0"})
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < self.retries:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise OpenAlexError(f"OpenAlex returned HTTP {e.code} for {redact(url)}") from None
            except urllib.error.URLError as e:
                if attempt < self.retries:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise OpenAlexError(f"Couldn't reach OpenAlex: {e.reason}") from None
        raise OpenAlexError("unreachable")

    def search_works(self, query: str, since: str | None = None, until: str | None = None,
                     max_results: int = 200, per_page: int = 50, extra_filter: str | None = None) -> Iterator[dict]:
        """Full-text search over titles and abstracts, newest first, cursor-paged."""
        filters = [f"title_and_abstract.search:{query}"]
        if since:
            filters.append(f"from_publication_date:{since}")
        if until:
            filters.append(f"to_publication_date:{until}")
        if extra_filter:
            filters.append(extra_filter)
        cursor, n = "*", 0
        while cursor and n < max_results:
            data = self.get("works", {"filter": ",".join(filters), "per-page": min(per_page, 200),
                                      "cursor": cursor, "select": WORK_FIELDS, "sort": "publication_date:desc"})
            for w in data.get("results", []):
                yield w
                n += 1
                if n >= max_results:
                    return
            cursor = (data.get("meta") or {}).get("next_cursor")

    def citing_works(self, openalex_id: str, since: str | None = None, max_results: int = 100) -> Iterator[dict]:
        """Works that cite the given work (for citation chasing from core papers)."""
        wid = openalex_id.rsplit("/", 1)[-1]
        filters = [f"cites:{wid}"] + ([f"from_publication_date:{since}"] if since else [])
        data = self.get("works", {"filter": ",".join(filters), "per-page": min(max_results, 200), "select": WORK_FIELDS})
        yield from data.get("results", [])

    def work_by_doi(self, doi: str) -> dict:
        return self.get(f"works/https://doi.org/{normalize_doi(doi)}", {"select": WORK_FIELDS})

    def author(self, openalex_id: str) -> dict:
        return self.get(f"authors/{openalex_id.rsplit('/', 1)[-1]}")

    def source(self, openalex_id: str) -> dict:
        return self.get(f"sources/{openalex_id.rsplit('/', 1)[-1]}")


def redact(url: str) -> str:
    """Remove the API key from a URL before it is logged or stored."""
    parts = urllib.parse.urlsplit(url)
    q = [(k, "REDACTED" if k == "api_key" else v) for k, v in urllib.parse.parse_qsl(parts.query)]
    return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(q)))


def normalize_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    d = doi.strip().lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "http://dx.doi.org/", "doi:"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    return d or None


def reconstruct_abstract(inverted_index: dict[str, list[int]] | None) -> str:
    """OpenAlex stores abstracts as {word: [positions]}; rebuild the text."""
    if not inverted_index:
        return ""
    positions = [(pos, word) for word, idxs in inverted_index.items() for pos in idxs]
    return " ".join(word for _, word in sorted(positions))


_VENUE_KIND = {"journal": "journal", "conference": "conference", "repository": "preprint", "book series": "conference"}


def venue_kind(work: dict) -> str:
    src = ((work.get("primary_location") or {}).get("source") or {})
    kind = _VENUE_KIND.get((src.get("type") or "").lower())
    name = (src.get("display_name") or "").lower()
    if "workshop" in name:
        return "workshop"
    if work.get("type") == "preprint" or kind == "preprint":
        return "preprint"
    if kind:
        return kind
    return "journal" if work.get("type") == "article" else "conference"


def paper_type(work: dict, kind: str) -> str:
    if kind == "preprint":
        return "Preprint"
    if kind == "journal":
        return "Journal article"
    if kind == "workshop":
        return "Workshop paper"
    return "Conference paper"


def to_paper(work: dict, found_in: str = "OpenAlex", discovered_at: str | None = None) -> dict:
    """Map an OpenAlex work to the site's paper record (metadata + abstract only).

    The analysis fields (summary, contribution, limitations, future work,
    affinity) are filled in by the scan after reading the paper. Until then the
    record is marked as not read, and author-stated fields are null (unknown),
    never [] (which would mean "the authors state none").
    """
    doi = normalize_doi(work.get("doi"))
    kind = venue_kind(work)
    loc = work.get("primary_location") or {}
    src = loc.get("source") or {}
    oa = work.get("best_oa_location") or {}
    authors = []
    for a in work.get("authorships") or []:
        au = a.get("author") or {}
        insts = [i.get("display_name") for i in a.get("institutions") or [] if i.get("display_name")]
        authors.append({k: v for k, v in {
            "name": au.get("display_name"),
            "affiliation": " / ".join(insts) or None,
            "profileUrl": au.get("id"),
            "orcid": au.get("orcid"),
        }.items() if v})
    keywords = [k.get("display_name") for k in work.get("keywords") or [] if k.get("display_name")]
    abstract = reconstruct_abstract(work.get("abstract_inverted_index"))
    rec = {
        "title": work.get("display_name") or "",
        "authors": authors,
        "year": work.get("publication_year"),
        "publishedDate": work.get("publication_date"),
        "venueName": src.get("display_name") or "",
        "venueKind": kind,
        "paperType": paper_type(work, kind),
        "doi": doi,
        "url": f"https://doi.org/{doi}" if doi else (loc.get("landing_page_url") or work.get("id")),
        "pdfUrl": oa.get("pdf_url") or "",
        "openAlexId": work.get("id"),
        "openAccess": bool((work.get("open_access") or {}).get("is_oa")),
        "keywords": keywords[:8],
        "abstract": abstract,
        "citations": work.get("cited_by_count"),
        "foundIn": [found_in],
        "fullTextRead": False,
        "fullTextSource": "abstract only (OpenAlex)" if abstract else "metadata only",
        "futureWork": None,
        "limitationsStated": None,
        "pendingDetail": True,
    }
    if discovered_at:
        rec["discoveredAt"] = discovered_at
    return rec


def _main(argv: list[str] | None = None) -> int:
    from .dedup import paper_id

    ap = argparse.ArgumentParser(prog="python -m radar.openalex", description="Fetch paper records from OpenAlex.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search", help="search titles and abstracts")
    s.add_argument("query")
    s.add_argument("--since", help="earliest publication date, YYYY-MM-DD")
    s.add_argument("--max", type=int, default=50)
    d = sub.add_parser("doi", help="look up one DOI")
    d.add_argument("doi")
    args = ap.parse_args(argv)
    oa = OpenAlex()
    try:
        works = oa.search_works(args.query, since=args.since, max_results=args.max) if args.cmd == "search" else [oa.work_by_doi(args.doi)]
        for w in works:
            rec = to_paper(w)
            rec["id"] = paper_id(rec)
            print(json.dumps(rec, ensure_ascii=False))
    except OpenAlexError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_main())
