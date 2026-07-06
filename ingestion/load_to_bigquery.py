"""Load cached NDJSON files into the ``nhl_raw`` BigQuery dataset.

Every ``cache/ndjson/*.ndjson`` file becomes one table (filename = table
name), replaced in full on each run (WRITE_TRUNCATE), with an appended
``_loaded_at`` UTC timestamp column. Schemas are autodetected; nested
game payloads were already flattened to JSON-string columns at ingest
time so autodetection stays deterministic.

Credentials: uses ``GOOGLE_APPLICATION_CREDENTIALS`` (path to a service
account JSON) or ``GCP_SERVICE_ACCOUNT_KEY`` (the JSON itself, as used
on Vercel). Reads a local ``.env`` if present.
"""

from __future__ import annotations

import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery
from google.oauth2 import service_account

from nhl_client import CACHE_DIR

NDJSON_DIR = CACHE_DIR / "ndjson"
REPO_ROOT = Path(__file__).parent.parent


def load_env_file(path: Path = REPO_ROOT / ".env") -> None:
    """Populate os.environ from a simple KEY=VALUE .env file (no overwrite)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def make_client() -> bigquery.Client:
    """Build a BigQuery client from env credentials (key JSON or key path)."""
    project_id = os.environ["GCP_PROJECT_ID"]
    key_json = os.environ.get("GCP_SERVICE_ACCOUNT_KEY")
    if key_json:
        info = json.loads(key_json)
        credentials = service_account.Credentials.from_service_account_info(info)
        return bigquery.Client(project=project_id, credentials=credentials)
    key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if key_path:
        resolved = (REPO_ROOT / key_path).resolve() if not Path(key_path).is_absolute() else Path(key_path)
        credentials = service_account.Credentials.from_service_account_file(str(resolved))
        return bigquery.Client(project=project_id, credentials=credentials)
    return bigquery.Client(project=project_id)  # fall back to ADC


def load_table(client: bigquery.Client, dataset: str, ndjson_path: Path) -> int:
    """Load one NDJSON file into ``dataset.<filename>``; return final row count."""
    table_id = f"{client.project}.{dataset}.{ndjson_path.stem}"
    loaded_at = datetime.now(timezone.utc).isoformat()

    buffer = io.BytesIO()
    for line in ndjson_path.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        record["_loaded_at"] = loaded_at
        buffer.write((json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8"))
    buffer.seek(0)

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        autodetect=True,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    job = client.load_table_from_file(buffer, table_id, job_config=job_config)
    job.result()
    return client.get_table(table_id).num_rows


def main() -> None:
    """Load every cached NDJSON file and print per-table row counts."""
    load_env_file()
    dataset = os.environ.get("BQ_DATASET_RAW", "nhl_raw")
    client = make_client()

    files = sorted(NDJSON_DIR.glob("*.ndjson"))
    if not files:
        raise SystemExit("no NDJSON files found; run the ingest scripts first")

    print(f"loading {len(files)} tables into {client.project}.{dataset}")
    for path in files:
        rows = load_table(client, dataset, path)
        print(f"  {dataset}.{path.stem}: {rows} rows")


if __name__ == "__main__":
    main()
