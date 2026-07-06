"""Build ``nhl_marts.mart_player_similarity``: statistical comps per player.

Method (v2):
- Skaters with >= 20 GP, split into forward and defense pools (styles do
  not compare across position groups); goalies get their own pool (>= 15 GP)
  with goalie-specific features.
- Features are TOI-honest per-60 rates plus usage and percentages. Points
  is excluded (it is literally goals + assists; keeping it double-weights
  scoring). EV and PP production are rated against EV and PP ice time.
- Each season's pool is z-score normalized independently; a player's
  vector blends the current season (75%) with their prior season (25%)
  when one exists, damping single-season outliers.
- Three weight profiles per skater ("overall", "offense", "physical") let
  a scout ask different questions of the same data; cosine similarity on
  weight-scaled vectors, top 25 comps stored per player per profile.

Output columns: player_id, comp_player_id, similarity_score, rank,
season_id, profile, position_group.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).parent.parent / "ingestion"))
from load_to_bigquery import load_env_file, make_client  # noqa: E402

SEASON_ID = 20252026
PREV_SEASON_ID = 20242025
PREV_SEASON_WEIGHT = 0.25
MIN_GP_SKATER = 20
MIN_GP_GOALIE = 15
TOP_N = 25
TABLE_NAME = "mart_player_similarity"

SKATER_FEATURES = [
    "goals_per_60",
    "assists_per_60",
    "shots_per_60",
    "shooting_pct",
    "toi_minutes_per_gp",
    "ev_points_per_60",
    "pp_points_per_60",
    "hits_per_60",
    "blocks_per_60",
    "pim_per_gp",
    "plus_minus_per_gp",
]
FORWARD_ONLY_FEATURES = ["faceoff_pct"]

GOALIE_FEATURES = [
    "save_pct",
    "goals_against_average",
    "games_started",
    "win_pct_per_start",
    "shots_against_per_start",
    "shutout_rate",
]

OFFENSE = {"goals_per_60", "assists_per_60", "shots_per_60", "shooting_pct", "ev_points_per_60", "pp_points_per_60"}
PHYSICAL = {"hits_per_60", "blocks_per_60", "pim_per_gp"}

# feature -> weight; features not listed default to 1.0
SKATER_PROFILES: dict[str, dict[str, float]] = {
    "overall": {},
    "offense": {**{f: 1.0 for f in OFFENSE}, **{f: 0.25 for f in PHYSICAL}, "toi_minutes_per_gp": 0.5, "plus_minus_per_gp": 0.5, "faceoff_pct": 0.5},
    "physical": {**{f: 0.25 for f in OFFENSE}, **{f: 1.0 for f in PHYSICAL}, "toi_minutes_per_gp": 0.75, "plus_minus_per_gp": 0.5, "faceoff_pct": 0.5},
}
GOALIE_PROFILES: dict[str, dict[str, float]] = {"overall": {}}

SPOT_CHECK_PLAYERS = ["Sidney Crosby", "Cale Makar", "Connor Hellebuyck"]


def fetch_skater_seasons(client, min_gp: int) -> pd.DataFrame:
    """Read qualifying skater seasons (both seasons) from mart_player_season."""
    query = f"""
        SELECT
            player_id, season_id, full_name, position_group, games_played,
            goals_per_60, assists_per_60, shots_per_60, shooting_pct,
            toi_minutes_per_gp, ev_points_per_60, pp_points_per_60,
            hits_per_60, blocks_per_60, pim_per_gp,
            plus_minus / games_played AS plus_minus_per_gp,
            faceoff_pct
        FROM nhl_marts.mart_player_season
        WHERE games_played >= {min_gp}
          AND season_id IN ({SEASON_ID}, {PREV_SEASON_ID})
    """
    return pd.DataFrame([dict(row) for row in client.query(query).result()])


def fetch_goalie_seasons(client, min_gp: int) -> pd.DataFrame:
    """Read qualifying goalie seasons (both seasons) from mart_goalie_season."""
    query = f"""
        SELECT
            player_id, season_id, full_name, position_group, games_played,
            save_pct, goals_against_average, games_started, win_pct_per_start,
            shots_against_per_start, shutout_rate
        FROM nhl_marts.mart_goalie_season
        WHERE games_played >= {min_gp}
          AND season_id IN ({SEASON_ID}, {PREV_SEASON_ID})
    """
    return pd.DataFrame([dict(row) for row in client.query(query).result()])


def build_feature_matrix(df: pd.DataFrame, features: list[str]) -> np.ndarray:
    """Mean-impute nulls and z-score normalize; returns players x features."""
    values = df[features].astype(float)
    values = values.fillna(values.mean())
    return StandardScaler().fit_transform(values.to_numpy())


def blend_with_prior_season(
    current: pd.DataFrame,
    current_z: np.ndarray,
    prior: pd.DataFrame,
    prior_z: np.ndarray,
    prior_weight: float = PREV_SEASON_WEIGHT,
) -> np.ndarray:
    """Blend each player's current-season z-vector with their prior season's.

    Both matrices are z-scored within their own season pools, so blending
    compares like with like. Players without a qualifying prior season keep
    their current-season vector unchanged.
    """
    prior_rows = {int(pid): i for i, pid in enumerate(prior["player_id"])}
    blended = current_z.copy()
    for i, pid in enumerate(current["player_id"]):
        j = prior_rows.get(int(pid))
        if j is not None:
            blended[i] = (1 - prior_weight) * current_z[i] + prior_weight * prior_z[j]
    return blended


def apply_profile_weights(matrix: np.ndarray, features: list[str], weights: dict[str, float]) -> np.ndarray:
    """Scale feature columns by sqrt(weight) so cosine reflects the profile."""
    scale = np.sqrt([weights.get(feature, 1.0) for feature in features])
    return matrix * scale


def top_comps_for_group(
    group: pd.DataFrame,
    matrix: np.ndarray,
    top_n: int,
    profile: str,
) -> list[dict]:
    """Rank the top-N most similar players within one weighted pool."""
    similarity = cosine_similarity(matrix)
    np.fill_diagonal(similarity, -np.inf)  # a player is not their own comp

    results: list[dict] = []
    keep = min(top_n, len(group) - 1)
    for i in range(len(group)):
        comp_order = np.argsort(similarity[i])[::-1][:keep]
        for rank, j in enumerate(comp_order, start=1):
            results.append(
                {
                    "player_id": int(group.iloc[i]["player_id"]),
                    "comp_player_id": int(group.iloc[j]["player_id"]),
                    "similarity_score": round(float(similarity[i, j]), 6),
                    "rank": rank,
                    "season_id": SEASON_ID,
                    "profile": profile,
                    "position_group": str(group.iloc[i]["position_group"]),
                }
            )
    return results


def compute_pool(
    df: pd.DataFrame,
    group_name: str,
    features: list[str],
    profiles: dict[str, dict[str, float]],
    top_n: int = TOP_N,
) -> list[dict]:
    """Comps for one position group: z-score per season, blend, run profiles."""
    current = df[(df["position_group"] == group_name) & (df["season_id"] == SEASON_ID)].reset_index(drop=True)
    prior = df[(df["position_group"] == group_name) & (df["season_id"] == PREV_SEASON_ID)].reset_index(drop=True)
    if len(current) < 2:
        return []

    current_z = build_feature_matrix(current, features)
    if len(prior) >= 2:
        prior_z = build_feature_matrix(prior, features)
        blended = blend_with_prior_season(current, current_z, prior, prior_z)
    else:
        blended = current_z

    results: list[dict] = []
    for profile, weights in profiles.items():
        weighted = apply_profile_weights(blended, features, weights)
        results.extend(top_comps_for_group(current, weighted, top_n, profile))
    print(f"position group {group_name}: {len(current)} players, {len(profiles)} profiles")
    return results


def write_to_bigquery(client, rows: list[dict]) -> int:
    """Replace the similarity mart with freshly computed rows."""
    from google.cloud import bigquery

    table_id = f"{client.project}.nhl_marts.{TABLE_NAME}"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=[
            bigquery.SchemaField("player_id", "INT64"),
            bigquery.SchemaField("comp_player_id", "INT64"),
            bigquery.SchemaField("similarity_score", "FLOAT64"),
            bigquery.SchemaField("rank", "INT64"),
            bigquery.SchemaField("season_id", "INT64"),
            bigquery.SchemaField("profile", "STRING"),
            bigquery.SchemaField("position_group", "STRING"),
        ],
    )
    client.load_table_from_json(rows, table_id, job_config=job_config).result()
    return client.get_table(table_id).num_rows


def print_spot_checks(names: pd.Series, rows: list[dict]) -> None:
    """Print top overall comps for a few well-known players for review."""
    by_player: dict[int, list[dict]] = {}
    for row in rows:
        if row["profile"] == "overall":
            by_player.setdefault(row["player_id"], []).append(row)

    name_to_id = {name: pid for pid, name in names.items()}
    for target in SPOT_CHECK_PLAYERS:
        player_id = name_to_id.get(target)
        if player_id is None or player_id not in by_player:
            print(f"\n{target}: not in pool")
            continue
        print(f"\nTop overall comps for {target}:")
        for comp in sorted(by_player[player_id], key=lambda r: r["rank"])[:10]:
            print(f"  {comp['rank']:>2}. {names[comp['comp_player_id']]:<25} score={comp['similarity_score']:.4f}")


def main() -> None:
    """Compute and publish the similarity mart, then print spot checks."""
    load_env_file()
    client = make_client()

    skaters = fetch_skater_seasons(client, MIN_GP_SKATER)
    goalies = fetch_goalie_seasons(client, MIN_GP_GOALIE)
    current_count = len(skaters[skaters.season_id == SEASON_ID]) + len(goalies[goalies.season_id == SEASON_ID])
    print(f"qualifying player-seasons: {len(skaters) + len(goalies)} ({current_count} current)")

    rows: list[dict] = []
    rows.extend(compute_pool(skaters, "F", SKATER_FEATURES + FORWARD_ONLY_FEATURES, SKATER_PROFILES))
    rows.extend(compute_pool(skaters, "D", SKATER_FEATURES, SKATER_PROFILES))
    rows.extend(compute_pool(goalies, "G", GOALIE_FEATURES, GOALIE_PROFILES))

    count = write_to_bigquery(client, rows)
    print(f"\nnhl_marts.{TABLE_NAME}: {count} rows written")

    names = pd.concat(
        [
            skaters[skaters.season_id == SEASON_ID].set_index("player_id")["full_name"],
            goalies[goalies.season_id == SEASON_ID].set_index("player_id")["full_name"],
        ]
    )
    print_spot_checks(names, rows)


if __name__ == "__main__":
    main()
