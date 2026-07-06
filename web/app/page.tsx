"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AgentResult = {
  answer: string;
  sql: string[];
  rows: Record<string, unknown>[];
};

const EXAMPLE_QUESTIONS = [
  "How has Pittsburgh's penalty kill performed over the last 15 games, and which opponents scored the most power play goals against them?",
  "Who led the league in points per game among players with at least 50 games this season?",
  "Which teams improved their power play the most from 2024-25 to 2025-26?",
  "How did Pittsburgh perform at home versus on the road this season?",
];

export default function ResearchPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Ask a hockey question</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Claude translates your question to SQL, runs it against the BigQuery warehouse, and
          answers with the data to back it up.
        </p>
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. Which defensemen blocked the most shots per game?"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm placeholder-zinc-500 outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          {loading ? "Researching…" : "Ask"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((example) => (
          <button
            key={example}
            onClick={() => ask(example)}
            disabled={loading}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-left text-xs text-zinc-300 hover:border-amber-400/60 disabled:opacity-40"
          >
            {example}
          </button>
        ))}
      </div>

      {loading && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
          Writing SQL and querying the warehouse… this usually takes 5-15 seconds.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="prose prose-sm prose-invert max-w-none rounded-lg border border-zinc-800 bg-zinc-900 p-5 prose-table:text-xs prose-th:text-zinc-400">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown>
          </div>

          {result.sql.length > 0 && (
            <details className="rounded-lg border border-zinc-800 bg-zinc-900">
              <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-400 hover:text-zinc-200">
                Show SQL ({result.sql.length} {result.sql.length === 1 ? "query" : "queries"})
              </summary>
              <div className="space-y-3 border-t border-zinc-800 p-4">
                {result.sql.map((sql, index) => (
                  <pre
                    key={index}
                    className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-emerald-300"
                  >
                    {sql}
                  </pre>
                ))}
              </div>
            </details>
          )}

          {result.rows.length > 0 && <DataTable rows={result.rows} />}
        </div>
      )}
    </div>
  );
}

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, index) => (
            <tr key={index} className="border-t border-zinc-800/70">
              {columns.map((column) => (
                <td key={column} className="px-3 py-2 text-zinc-300">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <div className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">
          Showing 50 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && !Number.isInteger(value)) return value.toFixed(3);
  return String(value);
}
