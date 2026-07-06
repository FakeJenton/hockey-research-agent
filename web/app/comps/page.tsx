"use client";

import { useEffect, useMemo, useState } from "react";

type StatLine = {
  player_id: number;
  full_name: string;
  team_abbrevs: string;
  position_code: string;
  position_group: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
  points_per_gp: number;
  shots: number;
  shooting_pct: number | null;
  toi_minutes_per_gp: number;
  pp_points: number;
  hits: number;
  blocked_shots: number;
  pim: number;
  plus_minus: number;
  faceoff_pct: number | null;
  rank?: number;
  similarity_score?: number;
};

type CompsResult = {
  player: StatLine | null;
  comps: StatLine[];
  otherMatches?: StatLine[];
  message?: string | null;
};

type PlayerRef = {
  player_id: number;
  full_name: string;
  team_abbrevs: string;
  position_code: string;
};

/** Lowercase and strip diacritics so "stutzle" matches "Stützle". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const MAX_SUGGESTIONS = 8;

/** Match on any name part's prefix (first OR last name), then substring. */
function suggestPlayers(players: PlayerRef[], query: string): PlayerRef[] {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const prefixMatches: PlayerRef[] = [];
  const substringMatches: PlayerRef[] = [];
  for (const player of players) {
    const full = normalize(player.full_name);
    if (full.split(/[\s-]+/).some((part) => part.startsWith(q)) || full.startsWith(q)) {
      prefixMatches.push(player);
    } else if (full.includes(q)) {
      substringMatches.push(player);
    }
    if (prefixMatches.length >= MAX_SUGGESTIONS) break;
  }
  return [...prefixMatches, ...substringMatches].slice(0, MAX_SUGGESTIONS);
}

const STAT_ROWS: { key: keyof StatLine; label: string; format?: "pct" | "fixed1" }[] = [
  { key: "games_played", label: "GP" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "points", label: "Points" },
  { key: "points_per_gp", label: "Pts/GP", format: "fixed1" },
  { key: "shots", label: "Shots" },
  { key: "shooting_pct", label: "Shooting %", format: "pct" },
  { key: "toi_minutes_per_gp", label: "TOI/GP (min)", format: "fixed1" },
  { key: "pp_points", label: "PP Points" },
  { key: "hits", label: "Hits" },
  { key: "blocked_shots", label: "Blocks" },
  { key: "pim", label: "PIM" },
  { key: "plus_minus", label: "+/-" },
  { key: "faceoff_pct", label: "Faceoff %", format: "pct" },
];

export default function CompsPage() {
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<PlayerRef[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompsResult | null>(null);
  const [selected, setSelected] = useState<StatLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blurbs, setBlurbs] = useState<Record<number, string>>({});
  const [blurbLoading, setBlurbLoading] = useState(false);

  // Load the eligible-player list once for instant client-side typeahead.
  useEffect(() => {
    fetch("/api/players")
      .then((response) => response.json())
      .then((data) => setPlayers(data.players ?? []))
      .catch(() => {}); // typeahead is an enhancement; free-text search still works
  }, []);

  const suggestions = useMemo(
    () => (showSuggestions ? suggestPlayers(players, name) : []),
    [players, name, showSuggestions],
  );

  async function search(searchName: string, playerId?: number) {
    const trimmed = searchName.trim();
    if ((trimmed.length < 2 && !playerId) || loading) return;
    setShowSuggestions(false);
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(null);
    setBlurbs({});
    try {
      const query = playerId ? `id=${playerId}` : `name=${encodeURIComponent(trimmed)}`;
      const response = await fetch(`/api/comps?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed");
      setResult(data);
      if (data.comps?.length > 0) setSelected(data.comps[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function loadBlurb(player: StatLine, comp: StatLine) {
    if (blurbs[comp.player_id] || blurbLoading) return;
    setBlurbLoading(true);
    try {
      const response = await fetch("/api/blurb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player, comp }),
      });
      const data = await response.json();
      if (response.ok && data.blurb) {
        setBlurbs((previous) => ({ ...previous, [comp.player_id]: data.blurb }));
      }
    } finally {
      setBlurbLoading(false);
    }
  }

  const player = result?.player ?? null;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Player similarity</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Search a 2025-26 skater (20+ games) to see their 10 closest statistical comps, computed
          from z-scored per-game stats within position group.
        </p>
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (suggestions.length > 0) {
            setName(suggestions[0].full_name);
            search(suggestions[0].full_name, suggestions[0].player_id);
          } else {
            search(name);
          }
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Start typing a first or last name…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm placeholder-zinc-500 outline-none focus:border-amber-400"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/50">
              {suggestions.map((suggestion) => (
                <li key={suggestion.player_id}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault(); // fire before the input's blur
                      setName(suggestion.full_name);
                      search(suggestion.full_name, suggestion.player_id);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-zinc-800"
                  >
                    <span>{suggestion.full_name}</span>
                    <span className="text-xs text-zinc-500">
                      {suggestion.position_code} · {suggestion.team_abbrevs}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || name.trim().length < 2}
          className="rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {result?.message && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-300">
          {result.message}
        </div>
      )}

      {player && result && result.comps.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-400">
              Top comps for{" "}
              <span className="text-zinc-100">
                {player.full_name} ({player.position_code}, {player.team_abbrevs})
              </span>
            </h3>
            <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {result.comps.map((comp) => (
                <li key={comp.player_id}>
                  <button
                    onClick={() => setSelected(comp)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-zinc-900 ${
                      selected?.player_id === comp.player_id ? "bg-zinc-900" : ""
                    }`}
                  >
                    <span>
                      <span className="mr-2 text-zinc-500">{comp.rank}.</span>
                      {comp.full_name}
                      <span className="ml-2 text-xs text-zinc-500">
                        {comp.position_code} · {comp.team_abbrevs}
                      </span>
                    </span>
                    <span className="text-xs text-amber-300">
                      {(comp.similarity_score ?? 0).toFixed(3)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {selected && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900 text-xs text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">2025-26</th>
                      <th className="px-3 py-2 text-right font-medium">{player.full_name}</th>
                      <th className="px-3 py-2 text-right font-medium">{selected.full_name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_ROWS.map(({ key, label, format }) => (
                      <tr key={key} className="border-t border-zinc-800/70">
                        <td className="px-3 py-1.5 text-xs text-zinc-400">{label}</td>
                        <td className="px-3 py-1.5 text-right">{formatStat(player[key], format)}</td>
                        <td className="px-3 py-1.5 text-right">
                          {formatStat(selected[key], format)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {blurbs[selected.player_id] ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-relaxed text-zinc-200">
                  {blurbs[selected.player_id]}
                </div>
              ) : (
                <button
                  onClick={() => loadBlurb(player, selected)}
                  disabled={blurbLoading}
                  className="rounded-lg border border-amber-400/50 px-4 py-2 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
                >
                  {blurbLoading ? "Writing scouting blurb…" : "Explain this comparison"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatStat(value: unknown, format?: "pct" | "fixed1"): string {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  if (format === "pct") return `${(numeric * 100).toFixed(1)}%`;
  if (format === "fixed1") return numeric.toFixed(1);
  return String(numeric);
}
