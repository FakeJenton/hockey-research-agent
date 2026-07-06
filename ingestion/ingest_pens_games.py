"""Ingest the Penguins' full season: schedule plus per-game team stats.

For each regular-season game (gameType=2) we fetch two gamecenter payloads:
- boxscore:   game state/outcome and player-level game stats
- right-rail: team-level game stats (PP conversion, PIM, hits, blocks);
              the boxscore does NOT carry these at team level

Nested game payloads are stored raw as a JSON string column (``payload``)
keyed by ``game_id`` so BigQuery schema autodetection never fights
game-to-game field variation. dbt staging parses them with JSON functions.
"""

from __future__ import annotations

import json
import logging

from nhl_client import API_WEB_BASE, CACHE_DIR, NHLClient, write_ndjson

TEAM = "PIT"
SEASON = 20252026
NDJSON_DIR = CACHE_DIR / "ndjson"


def wrap_payload(game_id: int, payload: dict) -> dict:
    """Wrap a nested gamecenter payload as a raw-JSON-string row."""
    return {
        "game_id": game_id,
        "season_id": SEASON,
        "payload": json.dumps(payload, ensure_ascii=False),
    }


def main() -> None:
    """Fetch the PIT schedule, then boxscore + right-rail for every game."""
    client = NHLClient()

    schedule = client.get_json(f"{API_WEB_BASE}/club-schedule-season/{TEAM}/{SEASON}")
    games = [g for g in schedule["games"] if g.get("gameType") == 2]
    print(f"schedule: {len(games)} regular-season games")

    schedule_rows = [wrap_payload(g["id"], g) for g in games]
    count = write_ndjson(schedule_rows, NDJSON_DIR / "raw_pit_schedule.ndjson")
    print(f"raw_pit_schedule: {count} rows written")

    boxscores: list[dict] = []
    rightrails: list[dict] = []
    for index, game in enumerate(games, start=1):
        game_id = game["id"]
        boxscores.append(
            wrap_payload(game_id, client.get_json(f"{API_WEB_BASE}/gamecenter/{game_id}/boxscore"))
        )
        rightrails.append(
            wrap_payload(game_id, client.get_json(f"{API_WEB_BASE}/gamecenter/{game_id}/right-rail"))
        )
        if index % 10 == 0 or index == len(games):
            print(f"  fetched {index}/{len(games)} games")

    count = write_ndjson(boxscores, NDJSON_DIR / "raw_pit_boxscores.ndjson")
    print(f"raw_pit_boxscores: {count} rows written")
    count = write_ndjson(rightrails, NDJSON_DIR / "raw_pit_rightrail.ndjson")
    print(f"raw_pit_rightrail: {count} rows written")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
