"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Exchange = {
  question: string;
  answer: string;
  sql: string[];
  rows: Record<string, unknown>[];
  status: string | null;
  done: boolean;
  error: string | null;
};

const EXAMPLE_QUESTIONS = [
  "Which teams most outperformed their expected goals this season?",
  "How did Sidney Crosby produce over his last 10 games?",
  "How has Toronto's penalty kill trended over their last 15 games?",
  "How did teams perform on the second night of back-to-backs?",
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
      { question: trimmed, answer: "", sql: [], rows: [], status: "Thinking…", done: false, error: null },
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
            patchLast({ sql: event.sql ?? [], rows: event.rows ?? [], status: null, done: true });
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
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Ask a hockey question</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Claude translates your question to SQL, runs it against the BigQuery warehouse, and
            answers with the data to back it up. Follow-ups keep the conversation context.
          </p>
        </div>
        {thread.length > 0 && (
          <button
            onClick={() => updateThread(() => [])}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500"
          >
            New conversation
          </button>
        )}
      </section>

      {thread.length === 0 && (
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

            {exchange.done && exchange.sql.length > 0 && (
              <details className="rounded-lg border border-zinc-800 bg-zinc-900">
                <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-400 hover:text-zinc-200">
                  Show SQL ({exchange.sql.length} {exchange.sql.length === 1 ? "query" : "queries"})
                </summary>
                <div className="space-y-3 border-t border-zinc-800 p-4">
                  {exchange.sql.map((sql, sqlIndex) => (
                    <pre
                      key={sqlIndex}
                      className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-emerald-300"
                    >
                      {sql}
                    </pre>
                  ))}
                </div>
              </details>
            )}

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
        className="sticky bottom-4 flex gap-2"
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
