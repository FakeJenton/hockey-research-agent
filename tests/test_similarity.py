"""Unit tests for the similarity engine: normalization, blending,
profile weighting, and position-group isolation."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "similarity"))

from compute_similarity import (
    SEASON_ID,
    PREV_SEASON_ID,
    SKATER_FEATURES,
    apply_profile_weights,
    blend_with_prior_season,
    build_feature_matrix,
    compute_pool,
    top_comps_for_group,
)


def make_players(
    position_group: str, count: int, start_id: int, seed: int, season_id: int = SEASON_ID
) -> pd.DataFrame:
    """Synthetic stat lines with predictable ids."""
    rng = np.random.default_rng(seed)
    frame = pd.DataFrame({feature: rng.uniform(0, 2, count) for feature in SKATER_FEATURES})
    frame["player_id"] = range(start_id, start_id + count)
    frame["full_name"] = [f"{position_group}{i}" for i in range(count)]
    frame["position_group"] = position_group
    frame["season_id"] = season_id
    frame["faceoff_pct"] = np.where(
        rng.uniform(size=count) > 0.5, rng.uniform(0.4, 0.6, count), np.nan
    )
    return frame


def test_feature_matrix_is_zscored():
    df = make_players("F", 50, start_id=1, seed=1)
    matrix = build_feature_matrix(df, SKATER_FEATURES)

    assert matrix.shape == (50, len(SKATER_FEATURES))
    np.testing.assert_allclose(matrix.mean(axis=0), 0, atol=1e-9)
    np.testing.assert_allclose(matrix.std(axis=0), 1, atol=1e-9)


def test_feature_matrix_imputes_nulls_neutrally():
    df = make_players("F", 50, start_id=1, seed=2)
    df.loc[0, "goals_per_60"] = np.nan
    matrix = build_feature_matrix(df, SKATER_FEATURES)

    assert np.isfinite(matrix).all()
    # mean-imputed value z-scores to ~0
    assert abs(matrix[0, SKATER_FEATURES.index("goals_per_60")]) < 1e-9


def test_constant_feature_does_not_blow_up():
    df = make_players("F", 20, start_id=1, seed=3)
    df["pim_per_gp"] = 0.5  # zero variance
    matrix = build_feature_matrix(df, SKATER_FEATURES)

    assert np.isfinite(matrix).all()


def test_blend_mixes_prior_season_only_for_returning_players():
    current = make_players("F", 4, start_id=1, seed=4)
    prior = make_players("F", 2, start_id=1, seed=5, season_id=PREV_SEASON_ID)  # ids 1, 2 return

    current_z = build_feature_matrix(current, SKATER_FEATURES)
    prior_z = build_feature_matrix(prior, SKATER_FEATURES)
    blended = blend_with_prior_season(current, current_z, prior, prior_z, prior_weight=0.25)

    np.testing.assert_allclose(blended[0], 0.75 * current_z[0] + 0.25 * prior_z[0])
    np.testing.assert_allclose(blended[1], 0.75 * current_z[1] + 0.25 * prior_z[1])
    # players 3 and 4 have no prior season: vectors unchanged
    np.testing.assert_allclose(blended[2], current_z[2])
    np.testing.assert_allclose(blended[3], current_z[3])


def test_zero_weight_removes_a_feature_from_similarity():
    df = make_players("F", 30, start_id=1, seed=6)
    matrix = build_feature_matrix(df, SKATER_FEATURES)

    weights = {feature: 0.0 for feature in SKATER_FEATURES}
    weights["goals_per_60"] = 1.0
    weighted = apply_profile_weights(matrix, SKATER_FEATURES, weights)

    goals_column = SKATER_FEATURES.index("goals_per_60")
    nonzero_columns = np.nonzero(np.abs(weighted).sum(axis=0))[0]
    assert list(nonzero_columns) == [goals_column]


def test_players_are_not_their_own_comp_and_ranks_are_dense():
    df = make_players("D", 30, start_id=100, seed=7).reset_index(drop=True)
    matrix = build_feature_matrix(df, SKATER_FEATURES)
    results = top_comps_for_group(df, matrix, top_n=10, profile="overall")

    by_player = {}
    for row in results:
        assert row["player_id"] != row["comp_player_id"]
        assert row["profile"] == "overall"
        by_player.setdefault(row["player_id"], []).append(row["rank"])
    for ranks in by_player.values():
        assert ranks == list(range(1, 11))


def test_comps_never_cross_position_groups():
    forwards = make_players("F", 25, start_id=1, seed=8)
    defensemen = make_players("D", 25, start_id=1000, seed=9)
    df = pd.concat([forwards, defensemen], ignore_index=True)

    profiles = {"overall": {}}
    results = compute_pool(df, "F", SKATER_FEATURES, profiles, top_n=5) + compute_pool(
        df, "D", SKATER_FEATURES, profiles, top_n=5
    )

    forward_ids = set(forwards["player_id"])
    defense_ids = set(defensemen["player_id"])
    for row in results:
        same_pool = (
            (row["player_id"] in forward_ids and row["comp_player_id"] in forward_ids)
            or (row["player_id"] in defense_ids and row["comp_player_id"] in defense_ids)
        )
        assert same_pool, f"cross-group comp: {row}"


def test_profiles_produce_different_rankings():
    df = make_players("F", 40, start_id=1, seed=10)
    profiles = {
        "overall": {},
        "offense_only": {f: 0.0 for f in ["hits_per_60", "blocks_per_60", "pim_per_gp"]},
    }
    results = compute_pool(df, "F", SKATER_FEATURES, profiles, top_n=5)

    top_by_profile: dict[str, dict[int, int]] = {}
    for row in results:
        if row["rank"] == 1:
            top_by_profile.setdefault(row["profile"], {})[row["player_id"]] = row["comp_player_id"]
    # at least one player's #1 comp should differ between profiles
    overall = top_by_profile["overall"]
    offense = top_by_profile["offense_only"]
    assert any(overall[pid] != offense[pid] for pid in overall)


def test_similarity_scores_sorted_descending_within_player():
    df = make_players("F", 40, start_id=1, seed=11).reset_index(drop=True)
    matrix = build_feature_matrix(df, SKATER_FEATURES)
    results = top_comps_for_group(df, matrix, top_n=10, profile="overall")

    by_player = {}
    for row in results:
        by_player.setdefault(row["player_id"], []).append(row)
    for rows in by_player.values():
        scores = [r["similarity_score"] for r in sorted(rows, key=lambda r: r["rank"])]
        assert scores == sorted(scores, reverse=True)
