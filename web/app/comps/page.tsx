"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RadarChart, ShotMap, type Shot } from "@/lib/charts";

const RADAR_AXES: { pctKey: string; label: string }[] = [
  { pctKey: "pct_points_per_gp", label: "Pts" },
  { pctKey: "pct_goals_per_gp", label: "Goals" },
  { pctKey: "pct_shots_per_gp", label: "Shots" },
  { pctKey: "pct_ev_points_per_60", label: "EV/60" },
  { pctKey: "pct_pp_points_per_gp", label: "PP" },
  { pctKey: "pct_toi_per_gp", label: "TOI" },
  { pctKey: "pct_plus_minus", label: "+/-" },
  { pctKey: "pct_shooting", label: "Sh%" },
  { pctKey: "pct_hits_per_gp", label: "Hits" },
  { pctKey: "pct_blocks_per_gp", label: "Blocks" },
];

type StatLine = Record<string, unknown> & {
  player_id: number;
  full_name: string;
  team_abbrevs: string;
  position_code: string;
  position_group: string;
  age: number | null;
  rank?: number;
  similarity_score?: number;
};

type CompsResult = {
  player: StatLine | null;
  comps: StatLine[];
  profile?: string;
  message?: string | null;
};

type PlayerRef = {
  player_id: number;
  full_name: string;
  team_abbrevs: string;
  position_code: string;
};

type StatRow = { key: string; label: string; format?: "pct" | "fixed1" | "fixed2"; pctKey?: string };

const SKATER_STAT_ROWS: StatRow[] = [
  { key: "games_played", label: "GP" },
  { key: "goals", label: "Goals", pctKey: "pct_goals_per_gp" },
  { key: "assists", label: "Assists" },
  { key: "points", label: "Points" },
  { key: "points_per_gp", label: "Pts/GP", format: "fixed2", pctKey: "pct_points_per_gp" },
  { key: "ev_points_per_60", label: "EV Pts/60", format: "fixed2", pctKey: "pct_ev_points_per_60" },
  { key: "shots", label: "Shots", pctKey: "pct_shots_per_gp" },
  { key: "shooting_pct", label: "Shooting %", format: "pct", pctKey: "pct_shooting" },
  { key: "toi_minutes_per_gp", label: "TOI/GP (min)", format: "fixed1", pctKey: "pct_toi_per_gp" },
  { key: "pp_points", label: "PP Points", pctKey: "pct_pp_points_per_gp" },
  { key: "hits", label: "Hits", pctKey: "pct_hits_per_gp" },
  { key: "blocked_shots", label: "Blocks", pctKey: "pct_blocks_per_gp" },
  { key: "pim", label: "PIM" },
  { key: "plus_minus", label: "+/-", pctKey: "pct_plus_minus" },
  { key: "faceoff_pct", label: "Faceoff %", format: "pct" },
];

const GOALIE_STAT_ROWS: StatRow[] = [
  { key: "games_played", label: "GP" },
  { key: "games_started", label: "Starts" },
  { key: "wins", label: "Wins" },
  { key: "win_pct_per_start", label: "Win % / start", format: "pct" },
  { key: "save_pct", label: "Save %", format: "pct" },
  { key: "goals_against_average", label: "GAA", format: "fixed2" },
  { key: "shots_against_per_start", label: "Shots against / start", format: "fixed1" },
  { key: "saves_per_start", label: "Saves / start", format: "fixed1" },
  { key: "shutouts", label: "Shutouts" },
];

const PROFILES = [
  { id: "overall", label: "Overall" },
  { id: "offense", label: "Offense" },
  { id: "physical", label: "Physical" },
];

const AGE_BAND = 3;
const SHOW_COMPS = 10;
const MAX_SUGGESTIONS = 8;

/** Lowercase and strip diacritics so "stutzle" matches "Stützle". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

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

export default function CompsPage() {
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<PlayerRef[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [profile, setProfile] = useState("overall");
  const [ageFilter, setAgeFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompsResult | null>(null);
  const [selected, setSelected] = useState<StatLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blurbs, setBlurbs] = useState<Record<string, string>>({});
  const [blurbLoading, setBlurbLoading] = useState(false);
  const [shotsCache, setShotsCache] = useState<Record<number, Shot[]>>({});

  async function loadShots(playerId: number) {
    if (shotsCache[playerId]) return;
    try {
      const response = await fetch(`/api/shots?id=${playerId}`);
      const data = await response.json();
      if (response.ok && data.shots) {
        setShotsCache((previous) => ({ ...previous, [playerId]: data.shots }));
      }
    } catch {
      // shot maps are an enhancement; ignore fetch failures
    }
  }

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

  async function search(searchName: string, playerId?: number, searchProfile = profile) {
    const trimmed = searchName.trim();
    if ((trimmed.length < 2 && !playerId) || loading) return;
    setShowSuggestions(false);
    setLoading(true);
    setError(null);
    try {
      const query = playerId ? `id=${playerId}` : `name=${encodeURIComponent(trimmed)}`;
      const response = await fetch(`/api/comps?${query}&profile=${searchProfile}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed");
      setResult(data);
      setSelected(data.comps?.[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  function switchProfile(nextProfile: string) {
    setProfile(nextProfile);
    if (result?.player) {
      search(result.player.full_name, result.player.player_id, nextProfile);
    }
  }

  async function loadBlurb(player: StatLine, comp: StatLine) {
    const key = `${player.player_id}-${comp.player_id}`;
    if (blurbs[key] || blurbLoading) return;
    setBlurbLoading(true);
    try {
      const response = await fetch("/api/blurb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player, comp }),
      });
      const data = await response.json();
      if (response.ok && data.blurb) {
        setBlurbs((previous) => ({ ...previous, [key]: data.blurb }));
      }
    } finally {
      setBlurbLoading(false);
    }
  }

  const player = result?.player ?? null;
  const isGoalie = player?.position_group === "G";
  const statRows = isGoalie ? GOALIE_STAT_ROWS : SKATER_STAT_ROWS;

  const visibleComps = useMemo(() => {
    const all = result?.comps ?? [];
    const filtered =
      ageFilter && player?.age != null
        ? all.filter((comp) => comp.age != null && Math.abs(Number(comp.age) - Number(player.age)) <= AGE_BAND)
        : all;
    return filtered.slice(0, SHOW_COMPS);
  }, [result, ageFilter, player]);

  // Derived rather than synced in an effect: if the age filter removes the
  // clicked comp, fall back to the top visible one.
  const activeComp =
    selected && visibleComps.some((comp) => comp.player_id === selected.player_id)
      ? selected
      : (visibleComps[0] ?? null);

  const blurbKey = player && activeComp ? `${player.player_id}-${activeComp.player_id}` : "";

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Player similarity</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Search any 2025-26 skater or goalie to see their closest statistical comps: z-scored
          per-60 profiles blended with the prior season, compared within position group.
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {!isGoalie && (
              <div className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-xs">
                {PROFILES.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => switchProfile(id)}
                    disabled={loading}
                    className={`rounded-md px-3 py-1.5 ${
                      profile === id ? "bg-amber-400 font-semibold text-zinc-950" : "hover:bg-zinc-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={ageFilter}
                onChange={(event) => setAgeFilter(event.target.checked)}
                className="accent-amber-400"
              />
              Similar age only (±{AGE_BAND} years)
            </label>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-400">
                Top comps for{" "}
                <span className="text-zinc-100">
                  {player.full_name} ({player.position_code}, {player.team_abbrevs}
                  {player.age != null ? `, ${player.age}` : ""})
                </span>
              </h3>
              {visibleComps.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
                  No comps within ±{AGE_BAND} years. Uncheck the age filter to see all comps.
                </div>
              ) : (
                <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                  {visibleComps.map((comp) => (
                    <li key={comp.player_id}>
                      <button
                        onClick={() => setSelected(comp)}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-zinc-900 ${
                          activeComp?.player_id === comp.player_id ? "bg-zinc-900" : ""
                        }`}
                      >
                        <span>
                          <span className="mr-2 text-zinc-500">{comp.rank}.</span>
                          {comp.full_name}
                          <span className="ml-2 text-xs text-zinc-500">
                            {comp.position_code} · {comp.team_abbrevs}
                            {comp.age != null ? ` · ${comp.age}y` : ""}
                          </span>
                        </span>
                        <span className="text-xs text-amber-300">
                          {(comp.similarity_score ?? 0).toFixed(3)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {activeComp && (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900 text-xs text-zinc-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">2025-26</th>
                        <th className="px-3 py-2 text-right font-medium">{player.full_name}</th>
                        <th className="px-3 py-2 text-right font-medium">{activeComp.full_name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statRows.map(({ key, label, format, pctKey }) => (
                        <tr key={key} className="border-t border-zinc-800/70">
                          <td className="px-3 py-1.5 text-xs text-zinc-400">{label}</td>
                          <StatCell line={player} statKey={key} format={format} pctKey={pctKey} />
                          <StatCell line={activeComp} statKey={key} format={format} pctKey={pctKey} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!isGoalie && (
                    <div className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
                      Small numbers are league percentile ranks among 20+ GP {player.position_group === "D" ? "defensemen" : "forwards"}.
                    </div>
                  )}
                </div>

                {blurbs[blurbKey] ? (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-sm leading-relaxed text-zinc-200">
                    {blurbs[blurbKey]}
                  </div>
                ) : (
                  <button
                    onClick={() => loadBlurb(player, activeComp)}
                    disabled={blurbLoading}
                    className="rounded-lg border border-amber-400/50 px-4 py-2 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
                  >
                    {blurbLoading ? "Writing scouting blurb…" : "Explain this comparison"}
                  </button>
                )}

                {!isGoalie && (
                  <details className="rounded-lg border border-zinc-800 bg-zinc-900">
                    <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-400 hover:text-zinc-200">
                      Percentile radar
                    </summary>
                    <div className="flex justify-center border-t border-zinc-800 p-4">
                      <RadarChart
                        nameA={player.full_name}
                        nameB={activeComp.full_name}
                        axes={RADAR_AXES.map(({ pctKey, label }) => ({
                          label,
                          a: Number(player[pctKey] ?? 0),
                          b: Number(activeComp[pctKey] ?? 0),
                        }))}
                      />
                    </div>
                  </details>
                )}

                {!isGoalie && (
                  <details
                    className="rounded-lg border border-zinc-800 bg-zinc-900"
                    onToggle={(event) => {
                      if ((event.target as HTMLDetailsElement).open) {
                        loadShots(player.player_id);
                        loadShots(activeComp.player_id);
                      }
                    }}
                  >
                    <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-400 hover:text-zinc-200">
                      Shot maps (xG model)
                    </summary>
                    <div className="grid gap-4 border-t border-zinc-800 p-4 sm:grid-cols-2">
                      {[player, activeComp].map((line) =>
                        shotsCache[line.player_id] ? (
                          <ShotMap
                            key={line.player_id}
                            title={line.full_name}
                            shots={shotsCache[line.player_id]}
                          />
                        ) : (
                          <div key={line.player_id} className="text-xs text-zinc-500">
                            Loading {line.full_name}&apos;s shots…
                          </div>
                        ),
                      )}
                    </div>
                  </details>
                )}

                <Link
                  href={`/?q=${encodeURIComponent(
                    `Compare ${player.full_name} and ${activeComp.full_name}'s 2025-26 seasons in depth. What does each do better?`,
                  )}`}
                  className="inline-block rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
                >
                  Ask the research agent about this comparison →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({
  line,
  statKey,
  format,
  pctKey,
}: {
  line: StatLine;
  statKey: string;
  format?: "pct" | "fixed1" | "fixed2";
  pctKey?: string;
}) {
  const pct = pctKey ? line[pctKey] : null;
  return (
    <td className="px-3 py-1.5 text-right">
      {formatStat(line[statKey], format)}
      {pct !== null && pct !== undefined && (
        <span className="ml-1.5 text-[10px] text-zinc-500">{Math.round(Number(pct) * 100)}</span>
      )}
    </td>
  );
}

function formatStat(value: unknown, format?: "pct" | "fixed1" | "fixed2"): string {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  if (format === "pct") return `${(numeric * 100).toFixed(1)}%`;
  if (format === "fixed1") return numeric.toFixed(1);
  if (format === "fixed2") return numeric.toFixed(2);
  return String(numeric);
}
