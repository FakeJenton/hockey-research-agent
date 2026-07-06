"""Ingest per-game Penguins boxscores (player-level game stats).

Schedule and team-level game stats are now ingested league-wide by
ingest_league_games.py; this script keeps only the PIT boxscore pulls,
whose playerByGameStats payloads are retained for a future player-game
mart.
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
    """Fetch the PIT schedule, then the boxscore for every game."""
    client = NHLClient()

    schedule = client.get_json(f"{API_WEB_BASE}/club-schedule-season/{TEAM}/{SEASON}")
    games = [g for g in schedule["games"] if g.get("gameType") == 2]
    print(f"schedule: {len(games)} regular-season games")

    boxscores = [
        wrap_payload(g["id"], client.get_json(f"{API_WEB_BASE}/gamecenter/{g['id']}/boxscore"))
        for g in games
    ]
    count = write_ndjson(boxscores, NDJSON_DIR / "raw_pit_boxscores.ndjson")
    print(f"raw_pit_boxscores: {count} rows written")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
