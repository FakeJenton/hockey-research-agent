import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAnthropic, MODEL } from "@/lib/anthropic";
import { runMartsQuery, validateSql } from "@/lib/bigquery";
import { buildSystemPrompt } from "@/lib/schema";

export const maxDuration = 60;

const MAX_SQL_ERRORS = 3;
const MAX_TURNS = 8;

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

export async function POST(request: Request) {
  let question: string;
  try {
    const body = await request.json();
    question = String(body.question ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!question || question.length > 1000) {
    return NextResponse.json({ error: "Provide a question under 1000 characters" }, { status: 400 });
  }

  const anthropic = getAnthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  let sqlErrors = 0;
  let lastSql: string | null = null;
  let lastRows: Record<string, unknown>[] = [];
  const executedSql: string[] = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(),
        tools,
        messages,
      });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const answer = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        return NextResponse.json({
          answer: answer || "I wasn't able to produce an answer for that question.",
          sql: executedSql,
          rows: lastRows,
        });
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const query = String((toolUse.input as { query?: unknown }).query ?? "");
        const validation = validateSql(query);

        if (!validation.ok) {
          sqlErrors++;
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: sqlErrorMessage(validation.error, sqlErrors),
          });
          continue;
        }

        try {
          const rows = await runMartsQuery(validation.sql);
          lastSql = validation.sql;
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

    return NextResponse.json({
      answer: "The question required more query steps than allowed. Try asking something more specific.",
      sql: executedSql,
      rows: lastRows,
    });
  } catch (error) {
    console.error("agent route error:", error);
    const message =
      error instanceof Anthropic.APIError ? `Claude API error: ${error.message}` : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sqlErrorMessage(detail: string, errorCount: number): string {
  if (errorCount >= MAX_SQL_ERRORS) {
    return `Query failed: ${detail}\nYou have used all ${MAX_SQL_ERRORS} query attempts. Do not call run_sql again; answer with what you have or explain what went wrong.`;
  }
  return `Query failed: ${detail}\nFix the SQL and try again (${MAX_SQL_ERRORS - errorCount} attempts remaining).`;
}
