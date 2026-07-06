import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getBigQuery } from "@/lib/bigquery";

// Fire-and-forget interaction logging to nhl_ops.agent_interactions.
// Uses a batch load job from a temp file: the BigQuery sandbox (no billing)
// rejects both streaming inserts and DML, but load jobs are free. Failures
// are swallowed: logging must never break an answer.
export function logAgentInteraction(entry: {
  question: string;
  answerChars: number;
  sql: string[];
  rowCount: number;
  durationMs: number;
  status: "ok" | "max_turns" | "error";
  model: string;
}): void {
  void writeLog(entry).catch((error) =>
    console.error("interaction log failed:", error?.message ?? error),
  );
}

async function writeLog(entry: {
  question: string;
  answerChars: number;
  sql: string[];
  rowCount: number;
  durationMs: number;
  status: string;
  model: string;
}): Promise<void> {
  const row = {
    created_at: new Date().toISOString(),
    question: entry.question.slice(0, 2000),
    answer_chars: entry.answerChars,
    sql_queries: entry.sql.join("\n---\n").slice(0, 10000),
    sql_count: entry.sql.length,
    row_count: entry.rowCount,
    duration_ms: entry.durationMs,
    status: entry.status,
    model: entry.model,
  };

  const path = join(tmpdir(), `agent-log-${randomUUID()}.ndjson`);
  await fs.writeFile(path, JSON.stringify(row) + "\n", "utf-8");
  try {
    const [job] = await getBigQuery()
      .dataset("nhl_ops")
      .table("agent_interactions")
      .load(path, {
        sourceFormat: "NEWLINE_DELIMITED_JSON",
        writeDisposition: "WRITE_APPEND",
      });
    const errors = job.status?.errors;
    if (errors?.length) throw new Error(errors[0].message);
  } finally {
    await fs.unlink(path).catch(() => {});
  }
}
