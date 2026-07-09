"""Train the expected-goals model and publish shot-level xG.

Model: logistic regression over unblocked shot attempts with a goalie in
net. Features: shot geometry (distance, angle), shot type, rebound and
rush flags, and strength state. Deliberately simple and public-data
honest: no pre-shot movement, screens, or shooter identity, which is
where proprietary models earn their edge. Reported metrics (holdout AUC
and calibration) quantify what this model is and is not.

Output: nhl_marts.fct_shots = every shot attempt with an `xg` column
(null for blocked attempts and empty-net situations, which are outside
the model's scope). Aggregations live in dbt (mart_player_xg_season,
mart_team_xg_season), built with `dbt run --select tag:xg` after this job.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder

sys.path.insert(0, str(Path(__file__).parent.parent / "ingestion"))
from load_to_bigquery import load_env_file, make_client  # noqa: E402

TABLE_NAME = "fct_shots"
NUMERIC_FEATURES = ["distance_ft", "angle_deg", "is_rebound", "is_rush"]
CATEGORICAL_FEATURES = ["shot_type", "strength_state"]
RANDOM_STATE = 42


def fetch_shots(client) -> pd.DataFrame:
    """Read all shot attempts from staging."""
    query = "SELECT * FROM nhl_stg.stg_shots"
    frame = pd.DataFrame([dict(row) for row in client.query(query).result()])
    print(f"shot attempts: {len(frame)}")
    return frame


def build_features(shots: pd.DataFrame, encoder: OneHotEncoder | None = None):
    """Numeric + one-hot feature matrix; fits the encoder when not supplied."""
    numeric = shots[NUMERIC_FEATURES].astype(float).to_numpy()
    categorical = shots[CATEGORICAL_FEATURES].fillna("unknown").astype(str)
    if encoder is None:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        encoded = encoder.fit_transform(categorical)
    else:
        encoded = encoder.transform(categorical)
    return np.hstack([numeric, encoded]), encoder


def train_and_score(shots: pd.DataFrame) -> pd.DataFrame:
    """Fit on eligible shots, report holdout metrics, score, return with xg."""
    eligible = shots[
        shots["event_type"].isin(["shot-on-goal", "missed-shot", "goal"])
        & ~shots["is_empty_net"].astype(bool)
    ].copy()
    # fit on regular season only; playoff attempts are scored out-of-sample
    training = eligible[eligible["game_type"] == 2]
    print(f"model-eligible (unblocked, goalie in net): {len(eligible)}")

    features, encoder = build_features(training)
    target = training["is_goal"].astype(int).to_numpy()

    x_train, x_test, y_train, y_test = train_test_split(
        features, target, test_size=0.2, random_state=RANDOM_STATE, stratify=target
    )
    model = LogisticRegression(max_iter=2000, C=1.0)
    model.fit(x_train, y_train)

    holdout_probability = model.predict_proba(x_test)[:, 1]
    auc = roc_auc_score(y_test, holdout_probability)
    print(f"holdout AUC: {auc:.4f}")
    print(f"holdout calibration: predicted {holdout_probability.sum():.1f} goals vs actual {y_test.sum()}")

    all_features, _ = build_features(eligible, encoder)
    eligible["xg"] = np.round(model.predict_proba(all_features)[:, 1], 5)
    league_predicted = eligible["xg"].sum()
    league_actual = eligible["is_goal"].sum()
    print(f"league calibration: predicted {league_predicted:.0f} goals vs actual {league_actual}")

    shots = shots.merge(
        eligible[["game_id", "event_id", "xg"]], on=["game_id", "event_id"], how="left"
    )
    return shots


def write_to_bigquery(client, shots: pd.DataFrame) -> int:
    """Replace nhl_marts.fct_shots via a load job (sandbox-safe)."""
    from google.cloud import bigquery

    table_id = f"{client.project}.nhl_marts.{TABLE_NAME}"
    records = shots.replace({np.nan: None}).to_dict(orient="records")

    with tempfile.NamedTemporaryFile(
        "w", suffix=".ndjson", delete=False, encoding="utf-8"
    ) as handle:
        for record in records:
            handle.write(json.dumps(record, default=str) + "\n")
        temp_path = handle.name

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        autodetect=True,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    with open(temp_path, "rb") as handle:
        client.load_table_from_file(handle, table_id, job_config=job_config).result()
    Path(temp_path).unlink(missing_ok=True)
    return client.get_table(table_id).num_rows


def main() -> None:
    """Train, score, publish, and print spot checks."""
    load_env_file()
    client = make_client()

    shots = fetch_shots(client)
    scored = train_and_score(shots)
    count = write_to_bigquery(client, scored)
    print(f"\nnhl_marts.{TABLE_NAME}: {count} rows written")

    top = (
        scored[scored["xg"].notna()]
        .groupby("team_abbrev")["xg"]
        .sum()
        .sort_values(ascending=False)
        .head(5)
    )
    print("\ntop teams by xG for:")
    for team, value in top.items():
        print(f"  {team}: {value:.1f}")


if __name__ == "__main__":
    main()
