"""Build ``nhl_marts.mart_player_similarity``: top-10 statistical comps per skater.

Method: for the primary season, take every skater with >= 20 games played,
split forwards and defensemen into separate pools (styles don't compare
across position groups; goalies are excluded), z-score normalize a feature
vector of per-game rates and percentages, and rank comps by cosine
similarity. Forwards additionally use faceoff percentage; nulls (wingers
who never take draws) are imputed to the pool mean, which is neutral after
z-scoring.

Output columns: player_id, comp_player_id, similarity_score, rank, season_id.
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
MIN_GAMES_PLAYED = 20
TOP_N = 10
TABLE_NAME = "mart_player_similarity"

BASE_FEATURES = [
    "goals_per_gp",
    "assists_per_gp",
    "points_per_gp",
    "shots_per_gp",
    "shooting_pct",
    "toi_minutes_per_gp",
    "pp_points_per_gp",
    "hits_per_gp",
    "blocks_per_gp",
    "pim_per_gp",
    "plus_minus_per_gp",
]
FORWARD_ONLY_FEATURES = ["faceoff_pct"]

SPOT_CHECK_PLAYERS = ["Sidney Crosby", "Connor McDavid", "Cale Makar"]


def fetch_player_seasons(client, season_id: int, min_gp: int) -> pd.DataFrame:
    """Read qualifying skater seasons from mart_player_season."""
    query = f"""
        SELECT
            player_id,
            full_name,
            position_group,
            games_played,
            goals_per_gp,
            assists_per_gp,
            points_per_gp,
            shots_per_gp,
            shooting_pct,
            toi_minutes_per_gp,
            pp_points_per_gp,
            hits_per_gp,
            blocks_per_gp,
            pim_per_gp,
            plus_minus / games_played AS plus_minus_per_gp,
            faceoff_pct
        FROM nhl_marts.mart_player_season
        WHERE season_id = {season_id} AND games_played >= {min_gp}
    """
    rows = [dict(row) for row in client.query(query).result()]
    return pd.DataFrame(rows)


def build_feature_matrix(df: pd.DataFrame, features: list[str]) -> np.ndarray:
    """Mean-impute nulls and z-score normalize; returns players x features."""
    values = df[features].astype(float)
    values = values.fillna(values.mean())
    return StandardScaler().fit_transform(values.to_numpy())


def top_comps_for_group(group: pd.DataFrame, features: list[str], top_n: int) -> list[dict]:
    """Rank the top-N most similar players within one position group."""
    group = group.reset_index(drop=True)
    matrix = build_feature_matrix(group, features)
    similarity = cosine_similarity(matrix)
    np.fill_diagonal(similarity, -np.inf)  # a player is not their own comp

    results: list[dict] = []
    keep = min(top_n, len(group) - 1)
    for i in range(len(group)):
        comp_order = np.argsort(similarity[i])[::-1][:keep]
        for rank, j in enumerate(comp_order, start=1):
            results.append(
                {
                    "player_id": int(group.loc[i, "player_id"]),
                    "comp_player_id": int(group.loc[j, "player_id"]),
                    "similarity_score": round(float(similarity[i, j]), 6),
                    "rank": rank,
                    "season_id": SEASON_ID,
                }
            )
    return results


def compute_all_comps(df: pd.DataFrame, top_n: int = TOP_N) -> list[dict]:
    """Compute comps per position group (F and D pools never mix)."""
    results: list[dict] = []
    for group_name, features in (
        ("F", BASE_FEATURES + FORWARD_ONLY_FEATURES),
        ("D", BASE_FEATURES),
    ):
        group = df[df["position_group"] == group_name]
        print(f"position group {group_name}: {len(group)} players, {len(features)} features")
        results.extend(top_comps_for_group(group, features, top_n))
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
        ],
    )
    client.load_table_from_json(rows, table_id, job_config=job_config).result()
    return client.get_table(table_id).num_rows


def print_spot_checks(df: pd.DataFrame, rows: list[dict]) -> None:
    """Print top comps for a few well-known players for manual review."""
    names = df.set_index("player_id")["full_name"]
    by_player: dict[int, list[dict]] = {}
    for row in rows:
        by_player.setdefault(row["player_id"], []).append(row)

    for target in SPOT_CHECK_PLAYERS:
        match = df[df["full_name"] == target]
        if match.empty:
            print(f"\n{target}: not in pool (GP < {MIN_GAMES_PLAYED}?)")
            continue
        player_id = int(match.iloc[0]["player_id"])
        print(f"\nTop comps for {target}:")
        for comp in sorted(by_player[player_id], key=lambda r: r["rank"]):
            print(
                f"  {comp['rank']:>2}. {names[comp['comp_player_id']]:<25}"
                f" score={comp['similarity_score']:.4f}"
            )


def main() -> None:
    """Compute and publish the similarity mart, then print spot checks."""
    load_env_file()
    client = make_client()

    df = fetch_player_seasons(client, SEASON_ID, MIN_GAMES_PLAYED)
    print(f"qualifying skaters (GP >= {MIN_GAMES_PLAYED}): {len(df)}")

    rows = compute_all_comps(df)
    count = write_to_bigquery(client, rows)
    print(f"\nnhl_marts.{TABLE_NAME}: {count} rows written")

    print_spot_checks(df, rows)


if __name__ == "__main__":
    main()
