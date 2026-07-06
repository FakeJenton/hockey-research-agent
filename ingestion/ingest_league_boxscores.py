"""Ingest boxscores for every 2025-26 game and emit flat player-game rows.

Replaces the earlier PIT-only boxscore ingest: playerByGameStats is parsed
at ingest time into one row per player per game (skaters and goalies),
enabling player game logs and rolling player form in the warehouse.

~1,312 games; first full run takes ~20 minutes with polite delays (PIT's
82 games are already cached), then everything is served from cache.
"""

from __future__ import annotations

import json
import logging

from nhl_client import API_WEB_BASE, CACHE_DIR, NHLClient, write_ndjson

NDJSON_DIR = CACHE_DIR / "ndjson"

SKATER_GROUPS = ("forwards", "defense")


def toi_to_seconds(toi: str | None) -> int | None:
    """Convert 'MM:SS' ice time to seconds."""
    if not toi or ":" not in toi:
        return None
    minutes, seconds = toi.split(":")
    return int(minutes) * 60 + int(seconds)


def parse_player_games(payload: dict) -> list[dict]:
    """Flatten one boxscore's playerByGameStats into player-game rows."""
    game_id = payload["id"]
    season_id = payload.get("season")
    game_date = payload.get("gameDate")
    sides = {
        "homeTeam": (payload["homeTeam"]["abbrev"], payload["awayTeam"]["abbrev"], True),
        "awayTeam": (payload["awayTeam"]["abbrev"], payload["homeTeam"]["abbrev"], False),
    }

    rows: list[dict] = []
    stats = payload.get("playerByGameStats") or {}
    for side_key, (team, opponent, is_home) in sides.items():
        side = stats.get(side_key) or {}
        for group in SKATER_GROUPS:
            for player in side.get(group) or []:
                rows.append(
                    {
                        "game_id": game_id,
                        "season_id": season_id,
                        "game_date": game_date,
                        "team_abbrev": team,
                        "opponent_abbrev": opponent,
                        "is_home": is_home,
                        "player_id": player.get("playerId"),
                        "full_name": (player.get("name") or {}).get("default"),
                        "position_code": player.get("position"),
                        "goals": player.get("goals"),
                        "assists": player.get("assists"),
                        "points": player.get("points"),
                        "plus_minus": player.get("plusMinus"),
                        "pim": player.get("pim"),
                        "hits": player.get("hits"),
                        "blocked_shots": player.get("blockedShots"),
                        "pp_goals": player.get("powerPlayGoals"),
                        "shots": player.get("sog"),
                        "faceoff_pct": player.get("faceoffWinningPctg"),
                        "toi_seconds": toi_to_seconds(player.get("toi")),
                        "shifts": player.get("shifts"),
                    }
                )
        for goalie in side.get("goalies") or []:
            # "saves/shots_against" string, e.g. "25/28"
            save_split = str(goalie.get("saveShotsAgainst") or "").split("/")
            saves = int(save_split[0]) if len(save_split) == 2 and save_split[0].isdigit() else None
            shots_against = (
                int(save_split[1]) if len(save_split) == 2 and save_split[1].isdigit() else None
            )
            rows.append(
                {
                    "game_id": game_id,
                    "season_id": season_id,
                    "game_date": game_date,
                    "team_abbrev": team,
                    "opponent_abbrev": opponent,
                    "is_home": is_home,
                    "player_id": goalie.get("playerId"),
                    "full_name": (goalie.get("name") or {}).get("default"),
                    "position_code": "G",
                    "goals": goalie.get("goals"),
                    "assists": goalie.get("assists"),
                    "points": None,
                    "plus_minus": None,
                    "pim": goalie.get("pim"),
                    "hits": None,
                    "blocked_shots": None,
                    "pp_goals": None,
                    "shots": None,
                    "faceoff_pct": None,
                    "toi_seconds": toi_to_seconds(goalie.get("toi")),
                    "shifts": None,
                    "saves": saves,
                    "shots_against": shots_against,
                }
            )
    return rows


def main() -> None:
    """Fetch the boxscore for every game in the ingested schedule."""
    client = NHLClient()

    schedule_path = NDJSON_DIR / "raw_schedule.ndjson"
    game_ids = sorted(
        json.loads(line)["game_id"] for line in schedule_path.read_text(encoding="utf-8").splitlines()
    )
    print(f"games: {len(game_ids)}")

    rows: list[dict] = []
    for index, game_id in enumerate(game_ids, start=1):
        payload = client.get_json(f"{API_WEB_BASE}/gamecenter/{game_id}/boxscore")
        rows.extend(parse_player_games(payload))
        if index % 100 == 0 or index == len(game_ids):
            print(f"  parsed {index}/{len(game_ids)} games ({len(rows)} player-games)", flush=True)

    count = write_ndjson(rows, NDJSON_DIR / "raw_player_games.ndjson")
    print(f"raw_player_games: {count} rows written")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
