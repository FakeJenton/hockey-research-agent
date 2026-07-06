import { NextResponse } from "next/server";
import { runMartsQuery } from "@/lib/bigquery";

export const maxDuration = 30;

// All model-eligible shot attempts for one player (2025-26), for the shot
// map. Coordinates are normalized client-side; the id arrives as a BigQuery
// query parameter.
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Provide a numeric player id" }, { status: 400 });
  }

  try {
    const shots = await runMartsQuery(
      `SELECT x_coord, y_coord, zone_code, xg, is_goal, shot_type, strength_state
       FROM nhl_marts.fct_shots
       WHERE shooting_player_id = @id AND xg IS NOT NULL
       ORDER BY xg DESC`,
      { id },
      1500,
    );
    return NextResponse.json(
      { shots },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    console.error("shots route error:", error);
    return NextResponse.json({ error: "Failed to load shots" }, { status: 500 });
  }
}
