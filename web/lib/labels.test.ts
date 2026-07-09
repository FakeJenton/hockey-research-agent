import { describe, expect, it } from "vitest";
import { humanizeColumn, labelMatchesRaw } from "./labels";

describe("humanizeColumn", () => {
  it("maps known warehouse columns to plain English", () => {
    expect(humanizeColumn("xg_for")).toBe("Expected Goals For");
    expect(humanizeColumn("ev_points_per_60")).toBe("EV Points per 60");
    expect(humanizeColumn("pk_pct_last_15")).toBe("Penalty Kill %, Last 15");
    expect(humanizeColumn("goals_above_expected")).toBe("Goals Above Expected");
    expect(humanizeColumn("toi_minutes_per_gp")).toBe("Ice Time per Game (min)");
    expect(humanizeColumn("is_back_to_back")).toBe("Back-to-Back");
  });

  it("is case-insensitive on lookup", () => {
    expect(humanizeColumn("XG_FOR")).toBe("Expected Goals For");
  });

  it("token-cases unknown agent aliases", () => {
    expect(humanizeColumn("pts_per_gp_24")).toBe("Pts per GP 24");
    expect(humanizeColumn("avg_xg_delta")).toBe("Avg xG Delta");
    expect(humanizeColumn("made_playoffs")).toBe("Made Playoffs");
  });
});

describe("labelMatchesRaw", () => {
  it("suppresses redundant parentheticals for identity labels", () => {
    expect(labelMatchesRaw("goals")).toBe(true);
    expect(labelMatchesRaw("rank")).toBe(true);
  });

  it("keeps the raw name when the label differs", () => {
    expect(labelMatchesRaw("xg_for")).toBe(false);
    expect(labelMatchesRaw("games_played")).toBe(false);
  });
});
