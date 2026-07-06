import { NextResponse } from "next/server";
import { runMartsQuery } from "@/lib/bigquery";

export const maxDuration = 30;

const SEASON_ID = 20252026;
const PROFILES = new Set(["overall", "offense", "physical"]);

const SKATER_COLUMNS = `
  m.player_id, m.full_name, m.team_abbrevs, m.position_code, m.position_group, m.age,
  m.games_played, m.goals, m.assists, m.points, m.points_per_gp, m.shots,
  m.shooting_pct, m.toi_minutes_per_gp, m.ev_points_per_60, m.pp_points, m.hits,
  m.blocked_shots, m.pim, m.plus_minus, m.faceoff_pct,
  m.pct_points_per_gp, m.pct_goals_per_gp, m.pct_shots_per_gp, m.pct_toi_per_gp,
  m.pct_pp_points_per_gp, m.pct_hits_per_gp, m.pct_blocks_per_gp, m.pct_shooting,
  m.pct_plus_minus, m.pct_ev_points_per_60`;

const GOALIE_COLUMNS = `
  m.player_id, m.full_name, m.team_abbrevs, m.position_code, m.position_group, m.age,
  m.games_played, m.games_started, m.wins, m.losses, m.ot_losses, m.win_pct_per_start,
  m.save_pct, m.goals_against_average, m.saves, m.shots_against, m.shutouts,
  m.saves_per_start, m.shots_against_per_start`;

// Player search + comps lookup, by exact player id (from the typeahead) or
// by name. All values are passed as BigQuery query parameters, never
// interpolated into SQL text.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id"));
  const name = params.get("name")?.trim() ?? "";
  const profile = PROFILES.has(params.get("profile") ?? "") ? params.get("profile")! : "overall";
  if (!Number.isInteger(id) || id <= 0) {
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "Provide a player name (2+ characters)" }, { status: 400 });
    }
  }

  try {
    let matches = await findPlayer("mart_player_season", SKATER_COLUMNS, id, name);
    let isGoalie = false;
    if (matches.length === 0) {
      matches = await findPlayer("mart_goalie_season", GOALIE_COLUMNS, id, name);
      isGoalie = matches.length > 0;
    }

    if (matches.length === 0) {
      return NextResponse.json({
        player: null,
        comps: [],
        message: `No 2025-26 player found matching "${name || id}".`,
      });
    }

    const player = matches[0];
    const statTable = isGoalie ? "mart_goalie_season" : "mart_player_season";
    const statColumns = isGoalie ? GOALIE_COLUMNS : SKATER_COLUMNS;
    const effectiveProfile = isGoalie ? "overall" : profile;

    const comps = await runMartsQuery(
      `SELECT s.rank, s.similarity_score, ${statColumns}
       FROM nhl_marts.mart_player_similarity s
       JOIN nhl_marts.${statTable} m
         ON m.player_id = s.comp_player_id AND m.season_id = s.season_id
       WHERE s.player_id = @playerId AND s.season_id = ${SEASON_ID} AND s.profile = @profile
       ORDER BY s.rank`,
      { playerId: Number(player.player_id), profile: effectiveProfile },
    );

    const message =
      comps.length === 0
        ? `${player.full_name} did not play enough 2025-26 games for similarity comps to be computed.`
        : null;

    return NextResponse.json({
      player,
      comps,
      profile: effectiveProfile,
      otherMatches: matches.slice(1),
      message,
    });
  } catch (error) {
    console.error("comps route error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}

async function findPlayer(
  table: string,
  columns: string,
  id: number,
  name: string,
): Promise<Record<string, unknown>[]> {
  if (Number.isInteger(id) && id > 0) {
    return runMartsQuery(
      `SELECT ${columns} FROM nhl_marts.${table} m
       WHERE m.season_id = ${SEASON_ID} AND m.player_id = @id`,
      { id },
    );
  }
  return runMartsQuery(
    `SELECT ${columns} FROM nhl_marts.${table} m
     WHERE m.season_id = ${SEASON_ID} AND CONTAINS_SUBSTR(m.full_name, @name)
     ORDER BY m.games_played DESC
     LIMIT 5`,
    { name },
  );
}
