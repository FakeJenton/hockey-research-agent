"""Unit tests for the similarity engine: normalization and position-group split."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "similarity"))

from compute_similarity import (
    BASE_FEATURES,
    build_feature_matrix,
    compute_all_comps,
    top_comps_for_group,
)


def make_players(position_group: str, count: int, start_id: int, seed: int) -> pd.DataFrame:
    """Synthetic stat lines with predictable ids."""
    rng = np.random.default_rng(seed)
    frame = pd.DataFrame(
        {feature: rng.uniform(0, 2, count) for feature in BASE_FEATURES}
    )
    frame["player_id"] = range(start_id, start_id + count)
    frame["full_name"] = [f"{position_group}{i}" for i in range(count)]
    frame["position_group"] = position_group
    frame["faceoff_pct"] = np.where(
        rng.uniform(size=count) > 0.5, rng.uniform(0.4, 0.6, count), np.nan
    )
    return frame


def test_feature_matrix_is_zscored():
    df = make_players("F", 50, start_id=1, seed=1)
    matrix = build_feature_matrix(df, BASE_FEATURES)

    assert matrix.shape == (50, len(BASE_FEATURES))
    np.testing.assert_allclose(matrix.mean(axis=0), 0, atol=1e-9)
    np.testing.assert_allclose(matrix.std(axis=0), 1, atol=1e-9)


def test_feature_matrix_imputes_nulls_neutrally():
    df = make_players("F", 50, start_id=1, seed=2)
    df.loc[0, "goals_per_gp"] = np.nan
    matrix = build_feature_matrix(df, BASE_FEATURES)

    assert np.isfinite(matrix).all()
    # mean-imputed value z-scores to ~0
    assert abs(matrix[0, BASE_FEATURES.index("goals_per_gp")]) < 1e-9


def test_constant_feature_does_not_blow_up():
    df = make_players("F", 20, start_id=1, seed=3)
    df["pim_per_gp"] = 0.5  # zero variance
    matrix = build_feature_matrix(df, BASE_FEATURES)

    assert np.isfinite(matrix).all()


def test_players_are_not_their_own_comp_and_ranks_are_dense():
    df = make_players("D", 30, start_id=100, seed=4)
    results = top_comps_for_group(df, BASE_FEATURES, top_n=10)

    by_player = {}
    for row in results:
        assert row["player_id"] != row["comp_player_id"]
        by_player.setdefault(row["player_id"], []).append(row["rank"])
    for ranks in by_player.values():
        assert ranks == list(range(1, 11))


def test_comps_never_cross_position_groups():
    forwards = make_players("F", 25, start_id=1, seed=5)
    defensemen = make_players("D", 25, start_id=1000, seed=6)
    df = pd.concat([forwards, defensemen], ignore_index=True)

    results = compute_all_comps(df, top_n=5)

    forward_ids = set(forwards["player_id"])
    defense_ids = set(defensemen["player_id"])
    for row in results:
        same_pool = (
            (row["player_id"] in forward_ids and row["comp_player_id"] in forward_ids)
            or (row["player_id"] in defense_ids and row["comp_player_id"] in defense_ids)
        )
        assert same_pool, f"cross-group comp: {row}"


def test_similarity_scores_sorted_descending_within_player():
    df = make_players("F", 40, start_id=1, seed=7)
    results = top_comps_for_group(df, BASE_FEATURES, top_n=10)

    by_player = {}
    for row in results:
        by_player.setdefault(row["player_id"], []).append(row)
    for rows in by_player.values():
        scores = [r["similarity_score"] for r in sorted(rows, key=lambda r: r["rank"])]
        assert scores == sorted(scores, reverse=True)
