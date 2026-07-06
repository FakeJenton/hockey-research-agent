import { NextResponse } from "next/server";
import { runMartsQuery } from "@/lib/bigquery";

export const maxDuration = 30;

// Full list of comp-eligible skaters (2025-26, GP >= 20) for client-side
// typeahead. Small payload (~700 rows), cached at the edge for a day so
// the warehouse is hit at most once per region per day.
export async function GET() {
  try {
    const players = await runMartsQuery(
      `SELECT player_id, full_name, team_abbrevs, position_code
       FROM nhl_marts.mart_player_season
       WHERE season_id = 20252026 AND games_played >= 20
       ORDER BY full_name`,
      undefined,
      2000, // well above the ~715 eligible skaters; the agent's 200-row cap stays default
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
