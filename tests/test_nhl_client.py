"""Unit tests for the NHL API client: caching, retries, and NDJSON output."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "ingestion"))

from nhl_client import NHLClient, cache_key_for, write_ndjson


def make_client(tmp_path: Path) -> NHLClient:
    return NHLClient(cache_dir=tmp_path, delay_seconds=0, max_retries=3)


def mock_response(payload: dict, status_code: int = 200) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


def test_cache_key_is_filesystem_safe():
    key = cache_key_for("https://api.nhle.com/stats/rest/en/skater/summary?limit=-1&cayenneExp=a%20b")
    assert key.endswith(".json")
    assert "/" not in key and "?" not in key and "%" not in key


def test_get_json_caches_response(tmp_path):
    client = make_client(tmp_path)
    client.session.get = MagicMock(return_value=mock_response({"ok": 1}))

    first = client.get_json("https://example.com/v1/thing")
    second = client.get_json("https://example.com/v1/thing")

    assert first == second == {"ok": 1}
    client.session.get.assert_called_once()  # second call served from disk
    assert len(list(tmp_path.glob("*.json"))) == 1


def test_get_json_retries_on_5xx_then_succeeds(tmp_path, monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _s: None)
    client = make_client(tmp_path)
    client.session.get = MagicMock(
        side_effect=[mock_response({}, status_code=503), mock_response({"ok": 1})]
    )

    assert client.get_json("https://example.com/v1/flaky") == {"ok": 1}
    assert client.session.get.call_count == 2


def test_get_json_gives_up_after_max_retries(tmp_path, monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _s: None)
    client = make_client(tmp_path)
    client.session.get = MagicMock(return_value=mock_response({}, status_code=500))

    with pytest.raises(RuntimeError, match="giving up"):
        client.get_json("https://example.com/v1/down")
    assert client.session.get.call_count == 3


def test_stats_rest_validates_total(tmp_path):
    client = make_client(tmp_path)
    client.get_json = MagicMock(return_value={"data": [{"a": 1}], "total": 5})

    with pytest.raises(ValueError, match="total=5"):
        client.stats_rest("skater/summary", 20252026)


def test_write_ndjson_roundtrip(tmp_path):
    path = tmp_path / "out.ndjson"
    rows = [{"id": 1, "name": "Sidney"}, {"id": 2, "name": "Evgeni"}]

    assert write_ndjson(rows, path) == 2
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    assert [json.loads(line) for line in lines] == rows
