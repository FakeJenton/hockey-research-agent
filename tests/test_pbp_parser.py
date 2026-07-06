"""Unit tests for play-by-play shot parsing: geometry, strength, sequence flags."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "ingestion"))

from pbp_parser import (
    attack_x,
    game_seconds,
    parse_shots,
    shot_geometry,
    strength_state,
)

SAMPLE = Path(__file__).parent / "fixtures" / "pbp_2025020002.json"


def test_game_seconds():
    assert game_seconds(1, "00:21") == 21
    assert game_seconds(2, "05:30") == 1530
    assert game_seconds(4, "01:00") == 3660  # overtime


def test_attack_x_orientation():
    # home defends left (-89) -> home attacks +89, away attacks -89
    assert attack_x(True, "left") == 89.0
    assert attack_x(False, "left") == -89.0
    assert attack_x(True, "right") == -89.0
    assert attack_x(False, "right") == 89.0


def test_shot_geometry():
    # 5 ft out, 10 ft off center: distance ~11.18, angle ~63.4 degrees
    distance, angle = shot_geometry(84, -10, 89.0)
    assert distance == pytest.approx(11.18, abs=0.01)
    assert angle == pytest.approx(63.43, abs=0.01)
    # dead center point shot
    distance, angle = shot_geometry(59, 0, 89.0)
    assert distance == 30.0
    assert angle == 0.0
    # defensive-zone shot toward the far net is far away
    distance, _ = shot_geometry(-70, 0, 89.0)
    assert distance == 159.0


def test_strength_state_from_situation_code():
    assert strength_state("1551", True) == "EV"
    assert strength_state("1451", True) == "PP"   # home 5 vs away 4
    assert strength_state("1451", False) == "SH"
    assert strength_state("0651", False) == "PP"  # away 6 skaters (goalie pulled)
    assert strength_state("", True) == "EV"


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample payload not cached")
def test_parse_shots_on_real_game():
    payload = json.loads(SAMPLE.read_text(encoding="utf-8"))
    shots = parse_shots(payload)

    # 53 SOG + 23 missed + 3 goals + 42 blocked = 121 attempts in this game
    assert len(shots) == 121
    goals = [s for s in shots if s["is_goal"]]
    assert len(goals) == 3
    assert {s["event_type"] for s in shots} == {"shot-on-goal", "missed-shot", "goal", "blocked-shot"}
    assert {s["team_abbrev"] for s in shots} == {"PIT", "NYR"}

    # every attempt has geometry and a strength state
    for shot in shots:
        assert shot["distance_ft"] >= 0
        assert 0 <= shot["angle_deg"] <= 90
        assert shot["strength_state"] in ("EV", "PP", "SH")

    # Crosby's first shot: x=84, y=-10, attacking +89 (away, home defends right)
    crosby = next(s for s in shots if s["shooting_player_id"] == 8471675)
    assert crosby["distance_ft"] == pytest.approx(11.18, abs=0.01)
    assert crosby["is_empty_net"] is False


def test_blocked_shot_attributed_to_shooting_team():
    payload = json.loads(SAMPLE.read_text(encoding="utf-8"))
    shots = parse_shots(payload)
    blocked = [s for s in shots if s["event_type"] == "blocked-shot"]
    assert len(blocked) == 42
    # both teams blocked some shots, so both teams appear as shooters
    assert {s["team_abbrev"] for s in blocked} == {"PIT", "NYR"}
