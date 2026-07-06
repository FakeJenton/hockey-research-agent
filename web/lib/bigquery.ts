import { BigQuery } from "@google-cloud/bigquery";

// Server-side only. Credentials come from GCP_SERVICE_ACCOUNT_KEY (full JSON
// string, used on Vercel where file paths don't exist in serverless) or
// GOOGLE_APPLICATION_CREDENTIALS (key file path, local dev).
let client: BigQuery | null = null;

export function getBigQuery(): BigQuery {
  if (client) return client;
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID is not set");

  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
  if (keyJson) {
    client = new BigQuery({ projectId, credentials: JSON.parse(keyJson) });
  } else {
    client = new BigQuery({
      projectId,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
  return client;
}

const ROW_LIMIT = 200;
const TIMEOUT_MS = 15_000;
const MAX_BYTES_BILLED = 2_000_000_000; // 2 GB safety cap, far above real usage

const BLOCKED_KEYWORDS =
  /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|call|execute|begin|commit|rollback|export|load)\b/i;
const BLOCKED_DATASETS = /\b(nhl_raw|nhl_stg|information_schema)\b/i;

export type SqlValidation = { ok: true; sql: string } | { ok: false; error: string };

/**
 * Guardrails for agent-generated SQL: read-only, marts dataset only,
 * single statement, hard row limit. User text is never interpolated into
 * SQL anywhere in this app; only Claude writes SQL and it all passes here.
 */
export function validateSql(rawSql: string): SqlValidation {
  const sql = rawSql.trim();
  if (!sql) return { ok: false, error: "Empty query" };
  if (sql.includes(";")) {
    return { ok: false, error: "Semicolons are not allowed; submit a single statement" };
  }
  if (!/^(select|with)\b/i.test(sql)) {
    return { ok: false, error: "Only SELECT queries are allowed" };
  }
  const blocked = sql.match(BLOCKED_KEYWORDS);
  if (blocked) {
    return { ok: false, error: `Keyword not allowed: ${blocked[0]}` };
  }
  const dataset = sql.match(BLOCKED_DATASETS);
  if (dataset) {
    return { ok: false, error: `Dataset not allowed: ${dataset[0]}. Query nhl_marts tables only` };
  }
  if (!/\bnhl_marts\s*\./i.test(sql)) {
    return { ok: false, error: "Queries must reference nhl_marts.<table>" };
  }
  const limited = /\blimit\s+\d+/i.test(sql) ? sql : `${sql}\nLIMIT ${ROW_LIMIT}`;
  return { ok: true, sql: limited };
}

/** Run a validated read-only query; returns at most ROW_LIMIT plain-object rows. */
export async function runMartsQuery(
  sql: string,
  params?: Record<string, string | number>,
): Promise<Record<string, unknown>[]> {
  const bigquery = getBigQuery();
  const [job] = await bigquery.createQueryJob({
    query: sql,
    params,
    jobTimeoutMs: TIMEOUT_MS,
    maximumBytesBilled: String(MAX_BYTES_BILLED),
    useLegacySql: false,
  });
  const [rows] = await job.getQueryResults({ maxResults: ROW_LIMIT, timeoutMs: TIMEOUT_MS });
  // BigQuery wraps DATE/TIMESTAMP in objects with a .value; flatten for JSON
  return rows.map((row: Record<string, unknown>) => {
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      flat[key] =
        value !== null && typeof value === "object" && "value" in value
          ? (value as { value: unknown }).value
          : value;
    }
    return flat;
  });
}
