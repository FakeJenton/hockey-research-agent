"""Ingest reference data: the NHL team list.

Writes ``cache/ndjson/raw_teams.ndjson``. The endpoint returns all 62
historical franchises; filtering to active teams happens in dbt staging
(via join to the team season summary). Player reference data is derived
in dbt from the skater and goalie summaries rather than ingested here,
which avoids ~1,000 per-player landing-page requests.
"""

from __future__ import annotations

import logging

from nhl_client import CACHE_DIR, STATS_REST_BASE, NHLClient, write_ndjson

NDJSON_DIR = CACHE_DIR / "ndjson"


def main() -> None:
    """Fetch the team reference list and write it as NDJSON."""
    client = NHLClient()
    payload = client.get_json(f"{STATS_REST_BASE}/team")
    rows = payload["data"]
    count = write_ndjson(rows, NDJSON_DIR / "raw_teams.ndjson")
    print(f"raw_teams: {count} rows")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
