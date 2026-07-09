"""Ingest league-wide game-grain data: every 2025-26 regular season game.

Pulls each team's schedule, dedupes to the unique game list (each game
appears on two teams' schedules), then fetches the gamecenter right-rail
for every game (the only source of team-level per-game stats: PP
conversion, PIM, hits, blocks).

Output: raw_schedule.ndjson and raw_rightrail.ndjson, one row per game,
nested payloads stored as raw JSON strings keyed by game_id. Replaces the
earlier PIT-only raw_pit_schedule / raw_pit_rightrail tables.

~1,312 games; first full run takes ~20 minutes with polite delays, then
everything is served from the disk cache.
"""

from __future__ import annotations

import json
import logging

from nhl_client import API_WEB_BASE, CACHE_DIR, NHLClient, write_ndjson

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
    """Fetch all team schedules, then the right-rail for every unique game."""
    client = NHLClient()

    standings = client.get_json(f"{API_WEB_BASE}/standings/now")["standings"]
    tricodes = sorted(row["teamAbbrev"]["default"] for row in standings)
    print(f"teams: {len(tricodes)}")

    games: dict[int, dict] = {}
    for tricode in tricodes:
        schedule = client.get_json(f"{API_WEB_BASE}/club-schedule-season/{tricode}/{SEASON}")
        for game in schedule["games"]:
            # regular season and playoffs; game_type derives from the game id
            # downstream (digits 5-6: 02 = regular season, 03 = playoffs)
            if game.get("gameType") in (2, 3):
                games[game["id"]] = game
    regular = sum(1 for g in games.values() if g["gameType"] == 2)
    print(f"unique games: {len(games)} ({regular} regular season, {len(games) - regular} playoff)")

    schedule_rows = [wrap_payload(game_id, game) for game_id, game in sorted(games.items())]
    count = write_ndjson(schedule_rows, NDJSON_DIR / "raw_schedule.ndjson")
    print(f"raw_schedule: {count} rows written")

    rightrails: list[dict] = []
    for index, game_id in enumerate(sorted(games), start=1):
        rightrails.append(
            wrap_payload(game_id, client.get_json(f"{API_WEB_BASE}/gamecenter/{game_id}/right-rail"))
        )
        if index % 100 == 0 or index == len(games):
            print(f"  fetched {index}/{len(games)} right-rails", flush=True)

    count = write_ndjson(rightrails, NDJSON_DIR / "raw_rightrail.ndjson")
    print(f"raw_rightrail: {count} rows written")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
