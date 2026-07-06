"""Ingest play-by-play for every 2025-26 game and emit flat shot events.

Full payloads are cached to disk (they are large and mostly non-shot
events); only the parsed shot-attempt rows are written to NDJSON for the
warehouse. Parsing happens at ingest time because rebound/rush flags need
the event sequence, which is awkward to reconstruct in SQL.

~1,312 games; first full run takes ~20 minutes with polite delays, then
everything is served from the disk cache.
"""

from __future__ import annotations

import json
import logging

from nhl_client import API_WEB_BASE, CACHE_DIR, NHLClient, write_ndjson
from pbp_parser import parse_shots

NDJSON_DIR = CACHE_DIR / "ndjson"


def main() -> None:
    """Fetch play-by-play for every game in the ingested schedule."""
    client = NHLClient()

    schedule_path = NDJSON_DIR / "raw_schedule.ndjson"
    game_ids = sorted(
        json.loads(line)["game_id"] for line in schedule_path.read_text(encoding="utf-8").splitlines()
    )
    print(f"games: {len(game_ids)}")

    shots: list[dict] = []
    for index, game_id in enumerate(game_ids, start=1):
        payload = client.get_json(f"{API_WEB_BASE}/gamecenter/{game_id}/play-by-play")
        shots.extend(parse_shots(payload))
        if index % 100 == 0 or index == len(game_ids):
            print(f"  parsed {index}/{len(game_ids)} games ({len(shots)} shot attempts)", flush=True)

    count = write_ndjson(shots, NDJSON_DIR / "raw_shots.ndjson")
    print(f"raw_shots: {count} rows written")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
