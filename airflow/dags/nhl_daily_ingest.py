"""Daily NHL warehouse refresh DAG.

DEMONSTRATION ARTIFACT: this DAG documents how the pipeline would be
orchestrated in production. It is not deployed in this project (the repo's
pipeline runs on demand, and the demo season is complete, so nothing needs
a scheduler). It is written to be droppable into a real Airflow instance
where the repo, its virtualenv, and dbt profile live on the worker.

Design notes:
- BashOperators call the same CLI entry points a human runs, so local runs
  and orchestrated runs execute identical code paths.
- The four ingest branches are independent (season-level stats REST pulls,
  league schedules/right-rails, boxscores, play-by-play) and run in
  parallel, fanning into the load.
- dbt tests gate the ML jobs: if data quality fails, neither similarity
  nor the xG model rebuilds on top of bad inputs. The xG aggregate marts
  build after scoring, behind their own calibration test.
- retries=2 with a 5 minute delay absorbs transient NHL API and BigQuery
  hiccups; the ingest client also retries per-request with backoff.
- catchup=False: each run fully refreshes current-season data, so there is
  nothing to backfill by date interval.
"""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

REPO = "/opt/hockey-research-agent"
PYTHON = f"{REPO}/.venv/bin/python"
DBT = f"{REPO}/.venv/bin/dbt"
DBT_ARGS = f"--project-dir {REPO}/dbt --profiles-dir {REPO}/dbt"

default_args = {
    "owner": "hockey-rnd",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "depends_on_past": False,
}

with DAG(
    dag_id="nhl_daily_ingest",
    description="Refresh NHL raw data, rebuild dbt marts, recompute player similarity",
    schedule="0 6 * * *",  # 6am daily, after the previous night's games are final
    start_date=datetime(2025, 10, 1),
    catchup=False,
    default_args=default_args,
    tags=["nhl", "warehouse"],
) as dag:
    ingest_standings = BashOperator(
        task_id="ingest_standings",
        bash_command=f"cd {REPO} && {PYTHON} ingestion/ingest_season_stats.py",
        doc_md="League-wide skater/goalie/team season stats (summary, realtime, TOI splits, bios) plus the standings snapshot.",
    )

    ingest_league_games = BashOperator(
        task_id="ingest_league_games",
        bash_command=f"cd {REPO} && {PYTHON} ingestion/ingest_league_games.py",
        doc_md="Every team's schedule plus per-game right-rail payloads (cached; only new games hit the API).",
    )

    ingest_league_boxscores = BashOperator(
        task_id="ingest_league_boxscores",
        bash_command=f"cd {REPO} && {PYTHON} ingestion/ingest_league_boxscores.py",
        doc_md="Per-game boxscores league-wide, flattened to player-game rows at ingest.",
    )

    ingest_play_by_play = BashOperator(
        task_id="ingest_play_by_play",
        bash_command=f"cd {REPO} && {PYTHON} ingestion/ingest_play_by_play.py",
        doc_md="Play-by-play league-wide, flattened to shot-attempt rows (geometry, strength, rebound/rush) at ingest.",
    )

    load_raw = BashOperator(
        task_id="load_raw",
        bash_command=f"cd {REPO} && {PYTHON} ingestion/load_to_bigquery.py",
        doc_md="Load all cached NDJSON into nhl_raw (WRITE_TRUNCATE, _loaded_at stamped).",
    )

    dbt_run = BashOperator(
        task_id="dbt_run",
        bash_command=f"{DBT} run {DBT_ARGS} --exclude tag:xg",
        doc_md="Base models; xg-tagged marts wait for the scoring job.",
    )

    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command=f"{DBT} test {DBT_ARGS} --exclude tag:xg",
        doc_md="Quality gate: uniqueness, not-null, accepted values, 82-game sanity checks.",
    )

    compute_similarity = BashOperator(
        task_id="compute_similarity",
        bash_command=f"cd {REPO} && {PYTHON} similarity/compute_similarity.py",
        doc_md="Rebuild mart_player_similarity from the freshly tested marts.",
    )

    train_xg = BashOperator(
        task_id="train_xg",
        bash_command=f"cd {REPO} && {PYTHON} xg/train_xg.py",
        doc_md="Retrain the shot-level xG model and publish nhl_marts.fct_shots.",
    )

    dbt_build_xg = BashOperator(
        task_id="dbt_build_xg",
        bash_command=f"{DBT} build {DBT_ARGS} --select tag:xg",
        doc_md="xG aggregate marts plus the calibration gate (predicted within 5% of actual goals).",
    )

    ingest_standings >> load_raw
    ingest_league_games >> load_raw
    ingest_league_boxscores >> load_raw
    ingest_play_by_play >> load_raw
    load_raw >> dbt_run >> dbt_test >> [compute_similarity, train_xg]
    train_xg >> dbt_build_xg
