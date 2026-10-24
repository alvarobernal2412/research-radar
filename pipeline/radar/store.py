"""Client for a self-hosted Research Radar server (infra/app), standard library only.

Documents are addressed by the same paths as the Claude artifact database
(``papers/<id>``, ``meta/topic``, ``radars/nlp/papers/<id>``), so the scan prompt
works the same on either backend. The server URL comes from ``base_url``, the
``RADAR_URL`` environment variable, or http://127.0.0.1:8787.

    store = Store()
    store.set("scanlock/current", {"radarId": "main"}, if_none_match=True)   # raises Conflict if taken
    data, version = store.get("meta/run")
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Mapping

DEFAULT_URL = "http://127.0.0.1:8787"
BATCH_SIZE = 50


class StoreError(RuntimeError):
    pass


class Conflict(StoreError):
    """A conditional write lost: the document exists (if_none_match) or its version moved (if_version)."""

    def __init__(self, version: int | None):
        super().__init__("version conflict" + (f" (current version {version})" if version is not None else ""))
        self.version = version


class Store:
    def __init__(self, base_url: str | None = None, timeout: float = 60.0):
        self.base = (base_url or os.environ.get("RADAR_URL") or DEFAULT_URL).rstrip("/")
        self.timeout = timeout

    def _call(self, method: str, url: str, body: Any = None, headers: Mapping[str, str] | None = None) -> tuple[int, Any]:
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(self.base + url, data=data, method=method, headers=dict(headers or {}))
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = {"error": raw[:200]}
            return e.code, payload
        except urllib.error.URLError as e:
            raise StoreError(f"can't reach the radar server at {self.base}: {e.reason}") from None

    @staticmethod
    def _fail(status: int, payload: Any) -> StoreError:
        if status == 409:
            return Conflict((payload or {}).get("version"))
        return StoreError(f"server returned HTTP {status}: {(payload or {}).get('error', payload)}")

    @staticmethod
    def _q(path: str) -> str:
        return urllib.parse.quote(path, safe="/")

    def get(self, path: str) -> tuple[Any, int] | None:
        """Return (data, version), or None when the document doesn't exist."""
        status, payload = self._call("GET", "/api/doc?path=" + self._q(path))
        if status == 404:
            return None
        if status != 200:
            raise self._fail(status, payload)
        return payload["data"], payload["version"]

    def set(self, path: str, data: Any, if_none_match: bool = False, if_version: int | None = None) -> int:
        headers: dict[str, str] = {}
        if if_none_match:
            headers["If-None-Match"] = "*"
        if if_version is not None:
            headers["If-Match"] = str(if_version)
        status, payload = self._call("PUT", "/api/doc?path=" + self._q(path), data, headers)
        if status != 200:
            raise self._fail(status, payload)
        return payload["version"]

    def update(self, path: str, patch: Mapping[str, Any]) -> int:
        """Merge top-level fields into the document (creating it when missing)."""
        status, payload = self._call("POST", "/api/batch", {"writes": [{"op": "update", "path": path, "data": dict(patch)}]})
        if status != 200:
            raise self._fail(status, payload)
        return payload["results"][0]["version"]

    def delete(self, path: str) -> None:
        status, payload = self._call("DELETE", "/api/doc?path=" + self._q(path))
        if status != 200:
            raise self._fail(status, payload)

    def list(self, collection: str) -> list[dict]:
        """Every document directly in the collection, as [{id, data, version}]."""
        status, payload = self._call("GET", "/api/col?path=" + self._q(collection))
        if status != 200:
            raise self._fail(status, payload)
        return payload

    def set_many(self, docs: Mapping[str, Any]) -> int:
        """Write {path: data} unconditionally, BATCH_SIZE per request. Returns how many were written."""
        items = list(docs.items())
        for i in range(0, len(items), BATCH_SIZE):
            writes = [{"op": "set", "path": p, "data": d} for p, d in items[i : i + BATCH_SIZE]]
            status, payload = self._call("POST", "/api/batch", {"writes": writes})
            if status != 200:
                raise self._fail(status, payload)
        return len(items)

    def capabilities(self) -> dict:
        status, payload = self._call("GET", "/api/capabilities")
        if status != 200:
            raise self._fail(status, payload)
        return payload

