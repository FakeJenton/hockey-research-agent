"""Unit tests for xG feature engineering."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent / "xg"))
sys.path.insert(0, str(Path(__file__).parent.parent / "ingestion"))

from train_xg import CATEGORICAL_FEATURES, NUMERIC_FEATURES, build_features


def make_shots(count: int = 20) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    return pd.DataFrame(
        {
            "distance_ft": rng.uniform(5, 60, count),
            "angle_deg": rng.uniform(0, 80, count),
            "is_rebound": rng.integers(0, 2, count).astype(bool),
            "is_rush": rng.integers(0, 2, count).astype(bool),
            "shot_type": rng.choice(["wrist", "slap", "tip-in"], count),
            "strength_state": rng.choice(["EV", "PP", "SH"], count),
        }
    )


def test_build_features_shape():
    shots = make_shots()
    features, encoder = build_features(shots)
    categories = sum(len(c) for c in encoder.categories_)
    assert features.shape == (len(shots), len(NUMERIC_FEATURES) + categories)
    assert np.isfinite(features).all()


def test_encoder_reuse_handles_unseen_categories():
    shots = make_shots()
    _, encoder = build_features(shots)

    new = make_shots(5)
    new["shot_type"] = "between-the-legs"  # not in training data
    features, _ = build_features(new, encoder)
    # unseen category encodes to all zeros instead of raising
    assert np.isfinite(features).all()


def test_null_shot_type_is_imputed():
    shots = make_shots(6)
    shots.loc[0, "shot_type"] = None
    features, _ = build_features(shots)
    assert np.isfinite(features).all()
