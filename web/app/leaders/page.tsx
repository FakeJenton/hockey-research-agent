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
  const [sections, setSections] = useState<Section[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leaders")
      .then((response) => response.json())
      .then((data) => {
        if (data.sections) setSections(data.sections);
        else setError(data.error ?? "Failed to load");
      })
      .catch(() => setError("Failed to load leaderboards"));
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">2025-26 league leaders</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Straight from the marts the research agent queries, including the expected-goals model.
          Click into Research to interrogate any of these numbers.
        </p>
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
