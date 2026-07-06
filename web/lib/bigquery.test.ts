import { describe, expect, it } from "vitest";
import { validateSql } from "./bigquery";

// The SQL guardrail is the security boundary between agent-generated SQL
// and the warehouse; every rule gets a test.
describe("validateSql", () => {
  it("accepts a plain SELECT against nhl_marts", () => {
    const result = validateSql("SELECT * FROM nhl_marts.mart_player_season");
    expect(result.ok).toBe(true);
  });

  it("accepts CTEs starting with WITH", () => {
    const result = validateSql(
      "WITH t AS (SELECT * FROM nhl_marts.fct_team_games) SELECT * FROM t",
    );
    expect(result.ok).toBe(true);
  });

  it("injects LIMIT 200 when absent", () => {
    const result = validateSql("SELECT * FROM nhl_marts.dim_teams");
    if (!result.ok) throw new Error(result.error);
    expect(result.sql).toMatch(/LIMIT 200$/);
  });

  it("preserves an existing LIMIT", () => {
    const result = validateSql("SELECT * FROM nhl_marts.dim_teams LIMIT 5");
    if (!result.ok) throw new Error(result.error);
    expect(result.sql).not.toMatch(/LIMIT 200/);
  });

  it("rejects empty queries", () => {
    expect(validateSql("").ok).toBe(false);
    expect(validateSql("   ").ok).toBe(false);
  });

  it("rejects semicolons (statement chaining)", () => {
    expect(validateSql("SELECT 1 FROM nhl_marts.dim_teams; DROP TABLE x").ok).toBe(false);
    expect(validateSql("SELECT 1 FROM nhl_marts.dim_teams;").ok).toBe(false);
  });

  it("rejects statements that do not start with SELECT or WITH", () => {
    expect(validateSql("EXPLAIN SELECT * FROM nhl_marts.dim_teams").ok).toBe(false);
    expect(validateSql("DESCRIBE nhl_marts.dim_teams").ok).toBe(false);
  });

  it.each(["INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "CREATE", "ALTER", "TRUNCATE", "GRANT", "CALL", "EXECUTE"])(
    "rejects the %s keyword anywhere in the statement",
    (keyword) => {
      const result = validateSql(
        `SELECT * FROM nhl_marts.dim_teams WHERE team_name = '${keyword.toLowerCase()} me' OR 1=(${keyword} something)`,
      );
      expect(result.ok).toBe(false);
    },
  );

  it("rejects the raw and staging datasets", () => {
    expect(validateSql("SELECT * FROM nhl_raw.raw_skater_summary").ok).toBe(false);
    expect(validateSql("SELECT * FROM nhl_stg.stg_skater_summary").ok).toBe(false);
    expect(
      validateSql("SELECT * FROM nhl_marts.dim_teams JOIN nhl_raw.raw_teams USING (team_id)").ok,
    ).toBe(false);
  });

  it("rejects INFORMATION_SCHEMA introspection", () => {
    expect(validateSql("SELECT * FROM nhl_marts.INFORMATION_SCHEMA.TABLES").ok).toBe(false);
  });

  it("requires at least one nhl_marts reference", () => {
    expect(validateSql("SELECT 1").ok).toBe(false);
    expect(validateSql("SELECT SESSION_USER()").ok).toBe(false);
  });
});
