"""Ingest league-wide season stats and the current standings snapshot.

Sources (stats REST unless noted):
- skater/summary  -> raw_skater_summary   (no hits/blocks; see realtime)
- skater/realtime -> raw_skater_realtime  (hits, blocks, take/giveaways)
- goalie/summary  -> raw_goalie_summary
- team/summary    -> raw_team_summary
- api-web /standings/now -> raw_standings (307-redirects to the last
  standings date in the offseason; the client follows redirects)

Each row gets an explicit ``season_id`` column. Both the primary season
(2025-26) and the comparison season (2024-25) are ingested.
"""

from __future__ import annotations

import logging

from nhl_client import API_WEB_BASE, CACHE_DIR, NHLClient, write_ndjson

PRIMARY_SEASON = 20252026
COMPARISON_SEASON = 20242025
SEASONS = (PRIMARY_SEASON, COMPARISON_SEASON)

NDJSON_DIR = CACHE_DIR / "ndjson"

REPORTS = {
    "raw_skater_summary": "skater/summary",
    "raw_skater_realtime": "skater/realtime",
    # ev/pp/sh ice time splits: required for strength-state per-60 rates
    "raw_skater_toi": "skater/timeonice",
    # birth dates and draft info: age context for similarity comps
    "raw_skater_bios": "skater/bios",
    "raw_goalie_summary": "goalie/summary",
    "raw_goalie_bios": "goalie/bios",
    "raw_team_summary": "team/summary",
}


def main() -> None:
    """Fetch all season-level reports for both seasons plus standings."""
    client = NHLClient()

    for table, report in REPORTS.items():
        rows: list[dict] = []
        for season in SEASONS:
            season_rows = client.stats_rest(report, season)
            for row in season_rows:
                row["season_id"] = season
            rows.extend(season_rows)
            print(f"{table}: season {season} -> {len(season_rows)} rows")
        count = write_ndjson(rows, NDJSON_DIR / f"{table}.ndjson")
        print(f"{table}: {count} total rows written")

    standings = client.get_json(f"{API_WEB_BASE}/standings/now")["standings"]
    for row in standings:
        row["season_id"] = row.get("seasonId", PRIMARY_SEASON)
    count = write_ndjson(standings, NDJSON_DIR / "raw_standings.ndjson")
    print(f"raw_standings: {count} rows written")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
