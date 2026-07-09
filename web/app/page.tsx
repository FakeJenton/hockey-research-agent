"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BarList, TrendChart } from "@/lib/charts";
import { humanizeColumn, labelMatchesRaw } from "@/lib/labels";

type Exchange = {
  question: string;
  answer: string;
  sql: string[];
  rows: Record<string, unknown>[];
  status: string | null;
  done: boolean;
  error: string | null;
  startedAt: number;
  durationMs: number | null;
};

const EXAMPLE_QUESTIONS = [
  "Who won the 2026 Stanley Cup, and how did their playoff run unfold?",
  "Which teams most outperformed their expected goals this season?",
  "How did Sidney Crosby produce over his last 10 games?",
  "How do Wayne Gretzky's career numbers compare to Gordie Howe's?",
];

export default function ResearchPage() {
  const [thread, setThread] = useState<Exchange[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<Exchange[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  function updateThread(mutate: (previous: Exchange[]) => Exchange[]) {
    threadRef.current = mutate(threadRef.current);
    setThread(threadRef.current);
  }

  // Support /?q=... deep links (e.g. from the Player Comps page).
  useEffect(() => {
    const seeded = new URLSearchParams(window.location.search).get("q");
    if (seeded) {
      window.history.replaceState({}, "", "/");
      ask(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [thread]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setQuestion("");
    setLoading(true);

    const history = threadRef.current
      .filter((exchange) => exchange.done && !exchange.error)
      .flatMap((exchange) => [
        { role: "user" as const, content: exchange.question },
        { role: "assistant" as const, content: exchange.answer },
      ]);

    updateThread((previous) => [
      ...previous,
      {
        question: trimmed,
        answer: "",
        sql: [],
        rows: [],
        status: "Thinking…",
        done: false,
        error: null,
        startedAt: Date.now(),
        durationMs: null,
      },
    ]);

    const patchLast = (patch: Partial<Exchange> | ((e: Exchange) => Partial<Exchange>)) =>
      updateThread((previous) => {
        const next = [...previous];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, ...(typeof patch === "function" ? patch(last) : patch) };
        return next;
      });

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, history }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const block of events) {
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "delta") {
            patchLast((last) => ({ answer: last.answer + event.text, status: null }));
          } else if (event.type === "status") {
            patchLast({ status: event.message });
          } else if (event.type === "done") {
            patchLast((last) => ({
              sql: event.sql ?? [],
              rows: event.rows ?? [],
              status: null,
              done: true,
              durationMs: Date.now() - last.startedAt,
            }));
          } else if (event.type === "error") {
            patchLast({ error: event.error, status: null, done: true });
          }
        }
      }
      patchLast((last) => (last.done ? {} : { done: true, status: null }));
    } catch (err) {
      patchLast({
        error: err instanceof Error ? err.message : "Something went wrong",
        status: null,
        done: true,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {thread.length === 0 ? (
        <section className="space-y-10 pt-8">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
              Conversational NHL analytics
            </p>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight">
              A century of hockey.
              <br />
              <span className="text-amber-400">One question away.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Hockey Research Agent turns plain English into analyst-grade answers: instant deep
              dives across every season, every playoff run, and every shot, with the data and SQL
              behind each number one click away.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["108", "NHL seasons, 1917 to today"],
              ["75K+", "player-seasons, incl. playoffs"],
              ["163K", "shots scored by an xG model"],
              ["100%", "of answers show their SQL"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <div className="text-2xl font-semibold text-amber-400">{value}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{label}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 text-xs sm:grid-cols-3">
            {[
              [
                "Ask like a scout",
                "Form, matchups, careers, eras, whole playoff runs. Follow-ups keep context, so one question becomes a real line of inquiry.",
              ],
              [
                "Answers with insight built in",
                "Streamed responses arrive with charts, game logs, rolling form, and an expected-goals model that separates shooting talent from luck.",
              ],
              [
                "Trust every number",
                "Read-only SQL over a 73-test warehouse validated against the record book. The query behind every answer is one click away.",
              ],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <span className="font-semibold text-zinc-100">{title}</span>
                <p className="mt-2 leading-relaxed text-zinc-500">{detail}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              See it answer
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map((example) => (
                <button
                  key={example}
                  onClick={() => ask(example)}
                  disabled={loading}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-zinc-100 disabled:opacity-40"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-400">Research conversation</h2>
          <button
            onClick={() => updateThread(() => [])}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
          >
            New conversation
          </button>
        </section>
      )}

      <div className="space-y-6">
        {thread.map((exchange, index) => (
          <div key={index} className="space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-amber-400/10 px-4 py-2.5 text-sm text-amber-100">
              {exchange.question}
            </div>

            {exchange.status && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                {exchange.status}
              </div>
            )}

            {exchange.error && (
              <div className="rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
                {exchange.error}
              </div>
            )}

            {exchange.answer && (
              <div className="prose prose-sm prose-invert max-w-none rounded-lg border border-zinc-800 bg-zinc-900 p-5 prose-table:text-xs prose-th:text-zinc-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{exchange.answer}</ReactMarkdown>
              </div>
            )}

            {exchange.done && !exchange.error && (
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                <span>
                  {exchange.sql.length} {exchange.sql.length === 1 ? "query" : "queries"}
                </span>
                <span>·</span>
                <span>{exchange.rows.length} rows</span>
                {exchange.durationMs !== null && (
                  <>
                    <span>·</span>
                    <span>{(exchange.durationMs / 1000).toFixed(1)}s</span>
                  </>
                )}
              </div>
            )}

            {exchange.done && exchange.sql.length > 0 && (
              <details className="rounded-lg border border-zinc-800 bg-zinc-900">
                <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-400 hover:text-zinc-200">
                  Show SQL
                </summary>
                <div className="space-y-3 border-t border-zinc-800 p-4">
                  {exchange.sql.map((sql, sqlIndex) => (
                    <SqlBlock key={sqlIndex} sql={sql} index={sqlIndex} total={exchange.sql.length} />
                  ))}
                </div>
              </details>
            )}

            {exchange.done && exchange.rows.length > 0 && <ResultChart rows={exchange.rows} />}
            {exchange.done && exchange.rows.length > 0 && <DataTable rows={exchange.rows} />}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
        className={thread.length > 0 ? "sticky bottom-4 flex gap-2" : "flex gap-2"}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            thread.length > 0
              ? "Ask a follow-up…"
              : "e.g. Which defensemen blocked the most shots per game?"
          }
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm placeholder-zinc-500 shadow-lg shadow-black/40 outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        >
          {loading ? "Researching…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

function SqlBlock({ sql, index, total }: { sql: string; index: number; total: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
          query {total > 1 ? `${index + 1} of ${total}` : ""}
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(sql).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs text-emerald-300">{sql}</pre>
    </div>
  );
}

const SEQUENTIAL_X = ["player_game_number", "game_number", "game_date", "month", "week"];
const EXCLUDED_METRICS = /(_id|_key|season_id|player_id|game_id)$/;

/** Chart heuristic: line for sequential results, bars for rankings. */
function ResultChart({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {});
  const numericColumns = columns.filter(
    (column) =>
      !EXCLUDED_METRICS.test(column) &&
      !SEQUENTIAL_X.includes(column) &&
      rows.every((row) => row[column] === null || typeof row[column] === "number"),
  );
  const xColumn = SEQUENTIAL_X.find((candidate) => columns.includes(candidate));
  const labelColumn = columns.find(
    (column) =>
      rows.every((row) => typeof row[column] === "string") &&
      new Set(rows.map((row) => row[column])).size > rows.length * 0.8,
  );

  const [metric, setMetric] = useState(numericColumns[0] ?? "");
  const activeMetric = numericColumns.includes(metric) ? metric : numericColumns[0];

  if (rows.length < 3 || numericColumns.length === 0) return null;
  const chartable = xColumn ? rows.length >= 5 : Boolean(labelColumn) && rows.length <= 40;
  if (!chartable || !activeMetric) return null;

  const valid = rows.filter((row) => row[activeMetric] !== null);

  return (
    <details open className="rounded-lg border border-zinc-800 bg-zinc-900">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-medium text-zinc-400 hover:text-zinc-200">
        <span>Chart</span>
        {numericColumns.length > 1 && (
          <select
            value={activeMetric}
            onClick={(event) => event.preventDefault()}
            onChange={(event) => setMetric(event.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-300"
          >
            {numericColumns.map((column) => (
              <option key={column} value={column} title={column}>
                {humanizeColumn(column)}
              </option>
            ))}
          </select>
        )}
      </summary>
      <div className="border-t border-zinc-800 p-4">
        {xColumn ? (
          <TrendChart
            yLabel={activeMetric}
            points={valid.map((row, index) => ({
              x: typeof row[xColumn] === "number" ? (row[xColumn] as number) : index,
              xLabel: String(row[xColumn]),
              y: Number(row[activeMetric]),
            }))}
          />
        ) : (
          <BarList
            format="dec1"
            rows={valid.slice(0, 20).map((row) => ({
              label: String(row[labelColumn!]),
              value: Number(row[activeMetric]),
            }))}
          />
        )}
      </div>
    </details>
  );
}

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0]);
  const numeric = new Set(
    columns.filter((column) => rows.some((row) => typeof row[column] === "number")),
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                title={labelMatchesRaw(column) ? undefined : `column: ${column}`}
                className={`px-3 py-2 font-medium ${numeric.has(column) ? "text-right" : ""} ${
                  labelMatchesRaw(column)
                    ? ""
                    : "cursor-help underline decoration-zinc-700 decoration-dotted underline-offset-4"
                }`}
              >
                {humanizeColumn(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, index) => (
            <tr key={index} className="border-t border-zinc-800/70 odd:bg-zinc-900/40">
              {columns.map((column) => (
                <td
                  key={column}
                  className={`px-3 py-2 text-zinc-300 ${numeric.has(column) ? "text-right" : ""}`}
                >
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
