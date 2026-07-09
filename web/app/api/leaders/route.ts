import { NextResponse } from "next/server";
import { runMartsQuery } from "@/lib/bigquery";

export const maxDuration = 30;

const SEASON_ID = 20252026;

type LeaderRow = { label: string; sublabel: string; value: number };
type Section = { id: string; title: string; note: string; format: "int" | "dec1" | "pct"; rows: LeaderRow[] };

// Formats 19811982 as "1981-82" for sublabels.
const SEASON_LABEL = `CONCAT(CAST(DIV(season_id, 10000) AS STRING), '-', SUBSTR(CAST(MOD(season_id, 10000) AS STRING), 3, 2))`;

// League leaderboards for the /leaders page. Two scopes: the current season
// and all-time (career + single-season records), with an active-players-only
// variant of all-time. Each URL variant is edge-cached for a day.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") === "alltime" ? "alltime" : "season";
  const activeOnly = params.get("active") === "1";

  try {
    if (scope === "alltime") {
      return NextResponse.json(
        { sections: await allTimeSections(activeOnly) },
        { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" } },
      );
    }
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

async function allTimeSections(activeOnly: boolean): Promise<Section[]> {
  // "active" always means: played in the current regular season
  const careerFilter = activeOnly ? "WHERE is_active" : "";
  const playoffCareerFilter = activeOnly
    ? "WHERE c.player_id IN (SELECT player_id FROM nhl_marts.mart_player_career WHERE is_active)"
    : "";
  const seasonJoinFilter = activeOnly
    ? "JOIN nhl_marts.mart_player_career c ON c.player_id = m.player_id AND c.is_active"
    : "";

  const [careerPoints, careerGoals, careerWins, playoffPoints, seasonGoals, seasonPoints] =
    await Promise.all([
      runMartsQuery(
        `SELECT full_name AS label,
                CONCAT(CAST(DIV(first_season_id, 10000) AS STRING), '-', CAST(MOD(last_season_id, 10000) AS STRING)) AS sublabel,
                points AS value
         FROM nhl_marts.mart_player_career ${careerFilter}
         ORDER BY points DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT full_name AS label,
                CONCAT(CAST(DIV(first_season_id, 10000) AS STRING), '-', CAST(MOD(last_season_id, 10000) AS STRING)) AS sublabel,
                goals AS value
         FROM nhl_marts.mart_player_career ${careerFilter}
         ORDER BY goals DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT full_name AS label,
                CONCAT(CAST(DIV(first_season_id, 10000) AS STRING), '-', CAST(MOD(last_season_id, 10000) AS STRING)) AS sublabel,
                wins AS value
         FROM nhl_marts.mart_goalie_career ${careerFilter}
         ORDER BY wins DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT c.full_name AS label,
                CONCAT(CAST(c.games_played AS STRING), ' playoff games') AS sublabel,
                c.points AS value
         FROM nhl_marts.mart_player_playoff_career c ${playoffCareerFilter}
         ORDER BY c.points DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT m.full_name AS label,
                CONCAT(m.team_abbrevs, ' · ', ${SEASON_LABEL}) AS sublabel,
                m.goals AS value
         FROM nhl_marts.mart_player_season m ${seasonJoinFilter}
         ORDER BY m.goals DESC LIMIT 10`,
      ),
      runMartsQuery(
        `SELECT m.full_name AS label,
                CONCAT(m.team_abbrevs, ' · ', ${SEASON_LABEL}) AS sublabel,
                m.points AS value
         FROM nhl_marts.mart_player_season m ${seasonJoinFilter}
         ORDER BY m.points DESC LIMIT 10`,
      ),
    ]);

  const who = activeOnly ? "active players" : "all players, 1917 to today";
  return [
    { id: "career_points", title: "Career points", note: who, format: "int", rows: careerPoints as LeaderRow[] },
    { id: "career_goals", title: "Career goals", note: who, format: "int", rows: careerGoals as LeaderRow[] },
    { id: "career_wins", title: "Career goalie wins", note: who, format: "int", rows: careerWins as LeaderRow[] },
    { id: "playoff_points", title: "Career playoff points", note: who, format: "int", rows: playoffPoints as LeaderRow[] },
    { id: "season_goals", title: "Best goal seasons", note: `single season, ${who}`, format: "int", rows: seasonGoals as LeaderRow[] },
    { id: "season_points", title: "Best point seasons", note: `single season, ${who}`, format: "int", rows: seasonPoints as LeaderRow[] },
  ];
}
