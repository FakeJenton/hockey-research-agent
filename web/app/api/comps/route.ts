import { NextResponse } from "next/server";
import { runMartsQuery } from "@/lib/bigquery";

export const maxDuration = 30;

const SEASON_ID = 20252026;

const STAT_COLUMNS = `
  m.player_id, m.full_name, m.team_abbrevs, m.position_code, m.position_group,
  m.games_played, m.goals, m.assists, m.points, m.points_per_gp, m.shots,
  m.shooting_pct, m.toi_minutes_per_gp, m.pp_points, m.hits, m.blocked_shots,
  m.pim, m.plus_minus, m.faceoff_pct`;

// Player search + comps lookup, by exact player id (from the typeahead) or
// by name. Both values are passed as BigQuery query parameters, never
// interpolated into SQL text.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id"));
  const name = params.get("name")?.trim() ?? "";
  if (!Number.isInteger(id) || id <= 0) {
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "Provide a player name (2+ characters)" }, { status: 400 });
    }
  }

  try {
    const matches =
      Number.isInteger(id) && id > 0
        ? await runMartsQuery(
            `SELECT ${STAT_COLUMNS}
             FROM nhl_marts.mart_player_season m
             WHERE m.season_id = ${SEASON_ID} AND m.player_id = @id`,
            { id },
          )
        : await runMartsQuery(
            `SELECT ${STAT_COLUMNS}
             FROM nhl_marts.mart_player_season m
             WHERE m.season_id = ${SEASON_ID}
               AND CONTAINS_SUBSTR(m.full_name, @name)
             ORDER BY m.points DESC
             LIMIT 5`,
            { name },
          );

    if (matches.length === 0) {
      return NextResponse.json({
        player: null,
        comps: [],
        message: `No 2025-26 skater found matching "${name}" (goalies are not included).`,
      });
    }

    const player = matches[0];
    const comps = await runMartsQuery(
      `SELECT s.rank, s.similarity_score, ${STAT_COLUMNS}
       FROM nhl_marts.mart_player_similarity s
       JOIN nhl_marts.mart_player_season m
         ON m.player_id = s.comp_player_id AND m.season_id = s.season_id
       WHERE s.player_id = @playerId AND s.season_id = ${SEASON_ID}
       ORDER BY s.rank`,
      { playerId: Number(player.player_id) },
    );

    const message =
      comps.length === 0
        ? `${player.full_name} played fewer than 20 games in 2025-26, so no similarity comps were computed.`
        : null;

    return NextResponse.json({ player, comps, otherMatches: matches.slice(1), message });
  } catch (error) {
    console.error("comps route error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
