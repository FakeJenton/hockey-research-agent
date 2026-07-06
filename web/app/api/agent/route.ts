import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { logAgentInteraction } from "@/lib/log";
import { runMartsQuery, validateSql } from "@/lib/bigquery";
import { buildSystemPrompt } from "@/lib/schema";

export const maxDuration = 60;

const MAX_SQL_ERRORS = 3;
const MAX_TURNS = 8;
const MAX_HISTORY_TURNS = 12; // user+assistant messages, i.e. 6 exchanges

const tools: Anthropic.Tool[] = [
  {
    name: "run_sql",
    description:
      "Run a single read-only BigQuery SELECT statement against the nhl_marts dataset and return the rows as JSON. No semicolons, max 200 rows.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The SELECT statement to execute" },
      },
      required: ["query"],
    },
  },
];

type HistoryMessage = { role: "user" | "assistant"; content: string };

// Streams Server-Sent Events: {type: "status"|"delta"|"done"|"error", ...}.
// Text deltas stream as Claude writes; "done" carries the executed SQL and
// the last result set for the transparency UI.
export async function POST(request: Request) {
  let question: string;
  let history: HistoryMessage[];
  try {
    const body = await request.json();
    question = String(body.question ?? "").trim();
    history = Array.isArray(body.history)
      ? body.history
          .filter(
            (m: HistoryMessage) =>
              (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
          )
          .slice(-MAX_HISTORY_TURNS)
      : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!question || question.length > 1000) {
    return NextResponse.json({ error: "Provide a question under 1000 characters" }, { status: 400 });
  }

  const anthropic = getAnthropic();
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: question },
  ];

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      let sqlErrors = 0;
      let answerChars = 0;
      let lastRows: Record<string, unknown>[] = [];
      const executedSql: string[] = [];

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const claudeStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: buildSystemPrompt(),
            tools,
            messages,
          });

          claudeStream.on("text", (delta) => {
            answerChars += delta.length;
            send({ type: "delta", text: delta });
          });

          const response = await claudeStream.finalMessage();
          const toolUses = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          );

          if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
            send({ type: "done", sql: executedSql, rows: lastRows });
            logAgentInteraction({
              question,
              answerChars,
              sql: executedSql,
              rowCount: lastRows.length,
              durationMs: Date.now() - startedAt,
              status: "ok",
              model: MODEL,
            });
            controller.close();
            return;
          }

          messages.push({ role: "assistant", content: response.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const toolUse of toolUses) {
            const query = String((toolUse.input as { query?: unknown }).query ?? "");
            const validation = validateSql(query);

            if (!validation.ok) {
              sqlErrors++;
              send({ type: "status", message: "Query rejected by guardrails, retrying…" });
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                is_error: true,
                content: sqlErrorMessage(validation.error, sqlErrors),
              });
              continue;
            }

            send({ type: "status", message: `Running query ${executedSql.length + 1}…` });
            try {
              const rows = await runMartsQuery(validation.sql);
              lastRows = rows;
              executedSql.push(validation.sql);
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({ row_count: rows.length, rows }),
              });
            } catch (error) {
              sqlErrors++;
              const message = error instanceof Error ? error.message : String(error);
              send({ type: "status", message: "Query failed, correcting…" });
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                is_error: true,
                content: sqlErrorMessage(message, sqlErrors),
              });
            }
          }

          messages.push({ role: "user", content: toolResults });
        }

        send({
          type: "done",
          sql: executedSql,
          rows: lastRows,
          note: "Stopped after the maximum number of query steps.",
        });
        logAgentInteraction({
          question,
          answerChars,
          sql: executedSql,
          rowCount: lastRows.length,
          durationMs: Date.now() - startedAt,
          status: "max_turns",
          model: MODEL,
        });
        controller.close();
      } catch (error) {
        console.error("agent route error:", error);
        const message =
          error instanceof Anthropic.APIError ? `Claude API error: ${error.message}` : "Internal error";
        send({ type: "error", error: message });
        logAgentInteraction({
          question,
          answerChars,
          sql: executedSql,
          rowCount: lastRows.length,
          durationMs: Date.now() - startedAt,
          status: "error",
          model: MODEL,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function sqlErrorMessage(detail: string, errorCount: number): string {
  if (errorCount >= MAX_SQL_ERRORS) {
    return `Query failed: ${detail}\nYou have used all ${MAX_SQL_ERRORS} query attempts. Do not call run_sql again; answer with what you have or explain what went wrong.`;
  }
  return `Query failed: ${detail}\nFix the SQL and try again (${MAX_SQL_ERRORS - errorCount} attempts remaining).`;
}
