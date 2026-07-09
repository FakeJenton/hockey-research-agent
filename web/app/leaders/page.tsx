"use client";

import { useEffect, useState } from "react";
import { BarList, type LeaderRow } from "@/lib/charts";

type Section = {
  id: string;
  title: string;
  note: string;
  format: "int" | "dec1" | "pct";
  rows: LeaderRow[];
};

export default function LeadersPage() {
  const [scope, setScope] = useState<"season" | "alltime">("season");
  const [activeOnly, setActiveOnly] = useState(false);
  // keyed by query string so switching scopes derives a fresh loading state
  // instead of resetting state synchronously in the effect
  const [loaded, setLoaded] = useState<{ query: string; sections: Section[] } | null>(null);
  const [failed, setFailed] = useState<{ query: string; message: string } | null>(null);

  const query = scope === "alltime" ? `?scope=alltime${activeOnly ? "&active=1" : ""}` : "";

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leaders${query}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.sections) setLoaded({ query, sections: data.sections });
        else setFailed({ query, message: data.error ?? "Failed to load" });
      })
      .catch(() => {
        if (!cancelled) setFailed({ query, message: "Failed to load leaderboards" });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const sections = loaded?.query === query ? loaded.sections : null;
  const error = failed?.query === query ? failed.message : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {scope === "season" ? "The 2025-26 season at a glance" : "The all-time record book"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            {scope === "season"
              ? "Scoring races, goaltending, closing form, and what the expected-goals model thinks of it all. Every board comes from the same warehouse the research agent queries, so any number here can be interrogated with a question."
              : "Career and single-season leaderboards across every NHL season since 1917-18. Flip to active players to see who is climbing the historic lists right now."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-xs">
            {(
              [
                ["season", "2025-26"],
                ["alltime", "All-time"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setScope(id)}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  scope === id ? "bg-amber-400 font-semibold text-zinc-950" : "hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {scope === "alltime" && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => setActiveOnly(event.target.checked)}
                className="accent-amber-400"
              />
              Active players only
            </label>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!sections && !error && (
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-4 h-4 w-28 rounded bg-zinc-800" />
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="h-3.5 rounded bg-zinc-800/70" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {sections && (
        <div className="grid gap-5 md:grid-cols-2">
          {sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <span className="text-xs text-zinc-500">{section.note}</span>
              </div>
              <BarList rows={section.rows} format={section.format} ranked />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
