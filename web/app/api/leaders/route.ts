import { NextResponse } from "next/server";
import { runMartsQuery } from "@/lib/bigquery";

export const maxDuration = 30;

const SEASON_ID = 20252026;

type LeaderRow = { label: string; sublabel: string; value: number };
type Section = { id: string; title: string; note: string; format: "int" | "dec1" | "pct"; rows: LeaderRow[] };

// League leaderboards for the /leaders page: seven fixed queries, edge-cached
// for a day (the season is complete, so this is effectively static).
export async function GET() {
  try {
    const [points, goals, xg, finishing, savePct, xgShare, hotClosers] = await Promise.all([
      runMartsQuery(
        `SELECT full_name AS label, team_abbrevs AS sublabel, points AS value
         FROM nhl_marts.mart_player_season WHERE season_id = ${SEASON_ID}
         ORDER BY points DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT full_name AS label, team_abbrevs AS sublabel, goals AS value
         FROM nhl_marts.mart_player_season WHERE season_id = ${SEASON_ID}
         ORDER BY goals DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT x.full_name AS label, p.team_abbrevs AS sublabel, x.expected_goals AS value
         FROM nhl_marts.mart_player_xg_season x
         JOIN nhl_marts.mart_player_season p
           ON p.player_id = x.player_id AND p.season_id = x.season_id
         ORDER BY x.expected_goals DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT x.full_name AS label, p.team_abbrevs AS sublabel, x.goals_above_expected AS value
         FROM nhl_marts.mart_player_xg_season x
         JOIN nhl_marts.mart_player_season p
           ON p.player_id = x.player_id AND p.season_id = x.season_id
         WHERE x.unblocked_attempts >= 100
         ORDER BY x.goals_above_expected DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT full_name AS label, team_abbrevs AS sublabel, save_pct AS value
         FROM nhl_marts.mart_goalie_season
         WHERE season_id = ${SEASON_ID} AND games_started >= 30
         ORDER BY save_pct DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT team_abbrev AS label, CAST(NULL AS STRING) AS sublabel, xg_share AS value
         FROM nhl_marts.mart_team_xg_season
         ORDER BY xg_share DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT full_name AS label, team_abbrev AS sublabel, points_last_10 AS value
         FROM nhl_marts.mart_player_form
         WHERE games_in_window = 10
         QUALIFY ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY player_game_number DESC) = 1
         ORDER BY points_last_10 DESC LIMIT 10`,
      ),
    ]);

    const sections: Section[] = [
      { id: "points", title: "Points", note: "2025-26 scoring leaders", format: "int", rows: points as LeaderRow[] },
      { id: "goals", title: "Goals", note: "2025-26 goal leaders", format: "int", rows: goals as LeaderRow[] },
      { id: "hot", title: "Hottest closers", note: "points over their final 10 games", format: "int", rows: hotClosers as LeaderRow[] },
      { id: "xg", title: "Expected goals", note: "shot-quality volume (xG model)", format: "dec1", rows: xg as LeaderRow[] },
      { id: "finishing", title: "Finishing", note: "goals above expected, 100+ attempts", format: "dec1", rows: finishing as LeaderRow[] },
      { id: "save_pct", title: "Save %", note: "30+ starts", format: "pct", rows: savePct as LeaderRow[] },
      { id: "xg_share", title: "Team xG share", note: "share of expected goals in their games", format: "pct", rows: xgShare as LeaderRow[] },
    ];

    return NextResponse.json(
      { sections },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("leaders route error:", error);
    return NextResponse.json({ error: "Failed to load leaderboards" }, { status: 500 });
  }
}
