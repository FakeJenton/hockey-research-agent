import { NextResponse } from "next/server";
import { getAnthropic, MODEL } from "@/lib/anthropic";

export const maxDuration = 30;

// In-memory blurb cache per player pair; resets on redeploy, which is fine
// for a demo (blurbs are cheap to regenerate).
const cache = new Map<string, string>();

type StatLine = Record<string, unknown> & { player_id: number; full_name: string };

export async function POST(request: Request) {
  let player: StatLine, comp: StatLine;
  try {
    const body = await request.json();
    player = body.player;
    comp = body.comp;
    if (!player?.player_id || !comp?.player_id) throw new Error("missing players");
  } catch {
    return NextResponse.json({ error: "Provide player and comp stat lines" }, { status: 400 });
  }

  const key = `${player.player_id}-${comp.player_id}`;
  const cached = cache.get(key);
  if (cached) return NextResponse.json({ blurb: cached, cached: true });

  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 512,
      system:
        "You are an NHL scout writing player comparisons. Write exactly 3-4 sentences in a professional scouting-report voice: concrete, stat-grounded, no hype. Percentages are decimals (0.12 = 12%). toi_minutes_per_gp is minutes per game.",
      messages: [
        {
          role: "user",
          content: `Explain why these two skaters' 2025-26 seasons are statistically similar, noting one meaningful difference.\n\nPlayer A: ${JSON.stringify(player)}\n\nPlayer B (comp): ${JSON.stringify(comp)}`,
        },
      ],
    });

    const blurb = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (blurb) cache.set(key, blurb);
    return NextResponse.json({ blurb, cached: false });
  } catch (error) {
    console.error("blurb route error:", error);
    return NextResponse.json({ error: "Blurb generation failed" }, { status: 500 });
  }
}
