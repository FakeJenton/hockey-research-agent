"""Thin NHL API client with disk caching, retries, and polite request pacing.

Every successful response is cached to ``ingestion/cache/raw/`` so re-runs
never re-hit the API. The NHL API is undocumented and unauthenticated;
we treat it gently (0.5s between live requests, retries with backoff).
"""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Iterable

import requests

API_WEB_BASE = "https://api-web.nhle.com/v1"
STATS_REST_BASE = "https://api.nhle.com/stats/rest/en"

CACHE_DIR = Path(__file__).parent / "cache"

logger = logging.getLogger(__name__)


def cache_key_for(url: str) -> str:
    """Build a filesystem-safe cache filename from a request URL."""
    stripped = re.sub(r"^https?://", "", url)
    return re.sub(r"[^A-Za-z0-9._-]+", "_", stripped) + ".json"


class NHLClient:
    """Fetch JSON from the NHL APIs with caching and retries.

    Args:
        cache_dir: Directory for cached raw responses.
        delay_seconds: Pause after every live (non-cached) request.
        max_retries: Attempts per URL before giving up.
    """

    def __init__(
        self,
        cache_dir: Path = CACHE_DIR / "raw",
        delay_seconds: float = 0.5,
        max_retries: int = 3,
    ) -> None:
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay_seconds = delay_seconds
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "hockey-research-agent (portfolio project)"

    def get_json(self, url: str, force_refresh: bool = False) -> Any:
        """Return parsed JSON for ``url``, from cache when available.

        Follows redirects (``/standings/now`` 307-redirects in the offseason).
        Retries on network errors and 5xx with linear backoff.
        """
        cache_path = self.cache_dir / cache_key_for(url)
        if cache_path.exists() and not force_refresh:
            logger.debug("cache hit: %s", url)
            return json.loads(cache_path.read_text(encoding="utf-8"))

        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.get(url, timeout=30)
                if response.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {response.status_code}", response=response)
                response.raise_for_status()
                data = response.json()
                cache_path.write_text(
                    json.dumps(data, ensure_ascii=False), encoding="utf-8"
                )
                time.sleep(self.delay_seconds)
                return data
            except (requests.RequestException, json.JSONDecodeError) as exc:
                last_error = exc
                logger.warning("attempt %d/%d failed for %s: %s", attempt, self.max_retries, url, exc)
                time.sleep(attempt)  # linear backoff: 1s, 2s, 3s
        raise RuntimeError(f"giving up on {url} after {self.max_retries} attempts") from last_error

    def stats_rest(self, report: str, season_id: int, game_type_id: int = 2) -> list[dict]:
        """Fetch a full stats REST report (e.g. ``skater/summary``) for one season."""
        cayenne = f"seasonId={season_id} and gameTypeId={game_type_id}"
        url = f"{STATS_REST_BASE}/{report}?limit=-1&cayenneExp={requests.utils.quote(cayenne)}"
        payload = self.get_json(url)
        data = payload["data"]
        if payload.get("total") not in (None, len(data)):
            raise ValueError(
                f"{report} {season_id}: got {len(data)} rows but total={payload['total']}"
            )
        return data


def write_ndjson(records: Iterable[dict], path: Path) -> int:
    """Write records as NDJSON (one JSON object per line). Returns row count."""
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
    return count
