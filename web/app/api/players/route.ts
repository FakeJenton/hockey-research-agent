import { NextResponse } from "next/server";
import { runMartsQuery } from "@/lib/bigquery";

export const maxDuration = 30;

// Full list of comp-eligible players (2025-26 skaters with 20+ GP plus
// goalies with 15+ GP) for client-side typeahead. Small payload (~750
// rows); the CDN edge caches for a day, browsers always revalidate.
export async function GET() {
  try {
    const players = await runMartsQuery(
      `SELECT player_id, full_name, team_abbrevs, position_code
       FROM nhl_marts.mart_player_season
       WHERE season_id = 20252026 AND games_played >= 20
       UNION ALL
       SELECT player_id, full_name, team_abbrevs, position_code
       FROM nhl_marts.mart_goalie_season
       WHERE season_id = 20252026 AND games_played >= 15
       ORDER BY full_name`,
      undefined,
      2000,
    );
    return NextResponse.json(
      { players },
      // max-age=0 keeps the browser from holding stale copies; the CDN edge
      // still caches for a day via s-maxage.
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("players route error:", error);
    return NextResponse.json({ error: "Failed to load player list" }, { status: 500 });
  }
}
