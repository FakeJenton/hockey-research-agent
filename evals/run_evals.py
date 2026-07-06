"""Golden-set evaluation harness for the research agent.

Replays a fixed set of questions against the /api/agent endpoint and checks
each response against per-case assertions:

- answer_contains_any: at least one substring appears in the answer (case-insensitive)
- sql_contains_any: at least one substring appears in the executed SQL
- sql_must_not_contain: none of these substrings appear in the SQL (guards
  against known bad derivations, e.g. dividing EV points by all-strengths TOI)
- min_rows / max_sql: bounds on returned rows and query count

Usage:
    python evals/run_evals.py                        # against local dev (localhost:3100)
    python evals/run_evals.py https://your-app.app   # against a deployment

Run this after any schema-doc, prompt, or model change. Exit code 1 on any
failure, so it can gate CI or a deploy.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:3100"
TIMEOUT_SECONDS = 120


def ask_agent(base_url: str, question: str) -> dict:
    """POST a question and reassemble the SSE stream into one result."""
    response = requests.post(
        f"{base_url}/api/agent",
        json={"question": question},
        stream=True,
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    answer_parts: list[str] = []
    sql: list[str] = []
    rows: list[dict] = []
    error: str | None = None
    # Parse SSE at the byte level, splitting only on b"\n\n" event boundaries.
    # (iter_lines splits on unicode separators like U+2028, which can appear
    # inside JSON string payloads and tear events apart.)
    buffer = b""
    for chunk in response.iter_content(chunk_size=8192):
        buffer += chunk
        while b"\n\n" in buffer:
            block, buffer = buffer.split(b"\n\n", 1)
            for raw_line in block.split(b"\n"):
                if not raw_line.startswith(b"data: "):
                    continue
                event = json.loads(raw_line[6:].decode("utf-8"))
                if event["type"] == "delta":
                    answer_parts.append(event["text"])
                elif event["type"] == "done":
                    sql = event.get("sql", [])
                    rows = event.get("rows", [])
                elif event["type"] == "error":
                    error = event.get("error")
    return {"answer": "".join(answer_parts), "sql": sql, "rows": rows, "error": error}


def check_case(case: dict, result: dict) -> list[str]:
    """Return a list of failure reasons (empty = pass)."""
    failures: list[str] = []
    if result["error"]:
        return [f"agent error: {result['error']}"]

    answer = result["answer"].lower()
    joined_sql = "\n".join(result["sql"]).lower()

    needles = case.get("answer_contains_any")
    if needles and not any(needle.lower() in answer for needle in needles):
        failures.append(f"answer missing all of {needles}")

    needles = case.get("sql_contains_any")
    if needles and not any(needle.lower() in joined_sql for needle in needles):
        failures.append(f"sql missing all of {needles}")

    for needle in case.get("sql_must_not_contain", []):
        if needle.lower() in joined_sql:
            failures.append(f"sql contains forbidden pattern: {needle}")

    if "min_rows" in case and len(result["rows"]) < case["min_rows"]:
        failures.append(f"expected >= {case['min_rows']} rows, got {len(result['rows'])}")
    if "max_sql" in case and len(result["sql"]) > case["max_sql"]:
        failures.append(f"expected <= {case['max_sql']} queries, ran {len(result['sql'])}")
    return failures


def main() -> None:
    base_url = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else DEFAULT_BASE_URL
    cases = json.loads((Path(__file__).parent / "golden_set.json").read_text(encoding="utf-8"))
    print(f"running {len(cases)} eval cases against {base_url}\n")

    failed = 0
    for case in cases:
        try:
            result = ask_agent(base_url, case["question"])
            failures = check_case(case, result)
        except Exception as exc:  # noqa: BLE001 - report and continue
            failures = [f"request failed: {exc}"]
        status = "PASS" if not failures else "FAIL"
        if failures:
            failed += 1
        print(f"  [{status}] {case['id']}")
        for reason in failures:
            print(f"         - {reason}")

    print(f"\n{len(cases) - failed}/{len(cases)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
