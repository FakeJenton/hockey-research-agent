"""Parse NHL play-by-play payloads into flat shot-attempt rows.

Extracted from the ingest script so the geometry and situation logic is
unit-testable. Conventions:

- Rink coordinates: x in [-100, 100], nets at x = +/-89, y in [-42, 42].
- homeTeamDefendingSide 'left' means the home net sits at x = -89 for that
  period, so home attacks +89 and away attacks -89 (verified empirically).
- situationCode is four digits: [away goalie][away skaters][home skaters]
  [home goalie]; '1551' is 5v5 with both goalies in.
"""

from __future__ import annotations

import math

SHOT_EVENTS = {"shot-on-goal", "missed-shot", "goal", "blocked-shot"}
UNBLOCKED_EVENTS = {"shot-on-goal", "missed-shot", "goal"}
NET_X = 89.0
REBOUND_WINDOW_SECONDS = 3
RUSH_WINDOW_SECONDS = 4


def game_seconds(period_number: int, time_in_period: str) -> int:
    """Convert period + 'MM:SS' elapsed time to seconds from game start."""
    minutes, seconds = time_in_period.split(":")
    return (period_number - 1) * 1200 + int(minutes) * 60 + int(seconds)


def attack_x(is_home_shooter: bool, home_defending_side: str) -> float:
    """X coordinate of the net the shooting team attacks this period."""
    home_attacks = NET_X if home_defending_side == "left" else -NET_X
    return home_attacks if is_home_shooter else -home_attacks


def shot_geometry(x: float, y: float, net_x: float) -> tuple[float, float]:
    """Distance (feet) and absolute angle (degrees, 0 = dead center) to the net."""
    dx = abs(net_x - x)
    distance = math.hypot(dx, y)
    angle = math.degrees(math.atan2(abs(y), dx)) if distance > 0 else 0.0
    return round(distance, 2), round(angle, 2)


def strength_state(situation_code: str, is_home_shooter: bool) -> str:
    """PP / EV / SH from the shooting team's perspective (skater counts only)."""
    if not situation_code or len(situation_code) != 4:
        return "EV"
    away_skaters, home_skaters = int(situation_code[1]), int(situation_code[2])
    diff = (home_skaters - away_skaters) if is_home_shooter else (away_skaters - home_skaters)
    if diff > 0:
        return "PP"
    if diff < 0:
        return "SH"
    return "EV"


def parse_shots(payload: dict) -> list[dict]:
    """Flatten one game's play-by-play into shot-attempt rows.

    Rebounds (unblocked attempt by the same team within 3s of the previous
    attempt) and rushes (attempt within 4s of an event in the neutral or
    shooting team's defensive zone) are derived from event sequence here,
    where the ordering context still exists.
    """
    game_id = payload["id"]
    home_id = payload["homeTeam"]["id"]
    home_abbrev = payload["homeTeam"]["abbrev"]
    away_abbrev = payload["awayTeam"]["abbrev"]

    rows: list[dict] = []
    last_attempt: dict | None = None  # previous unblocked attempt, any team
    last_non_ozone_seconds: dict[int, int] = {}  # team_id -> seconds of last N/D-zone event

    for play in sorted(payload.get("plays", []), key=lambda p: p.get("sortOrder", 0)):
        event_type = play.get("typeDescKey")
        details = play.get("details") or {}
        period = play.get("periodDescriptor") or {}
        if period.get("periodType") == "SO":
            continue  # shootout attempts are not xG events

        owner_id = details.get("eventOwnerTeamId")
        seconds = game_seconds(period.get("number", 1), play.get("timeInPeriod", "00:00"))

        # track when each team was last observed outside its offensive zone
        zone = details.get("zoneCode")
        if owner_id is not None and zone in ("N", "D"):
            last_non_ozone_seconds[owner_id] = seconds

        if event_type not in SHOT_EVENTS:
            continue
        if details.get("xCoord") is None or details.get("yCoord") is None:
            continue

        # blocked shots are owned by the BLOCKING team in this feed
        shooter_team_id = owner_id
        if event_type == "blocked-shot":
            shooter_team_id = home_id if owner_id != home_id else payload["awayTeam"]["id"]
        is_home_shooter = shooter_team_id == home_id

        net_x = attack_x(is_home_shooter, play.get("homeTeamDefendingSide", "left"))
        distance, angle = shot_geometry(details["xCoord"], details["yCoord"], net_x)

        is_rebound = bool(
            event_type in UNBLOCKED_EVENTS
            and last_attempt
            and last_attempt["shooter_team_id"] == shooter_team_id
            and 0 <= seconds - last_attempt["seconds"] <= REBOUND_WINDOW_SECONDS
            and last_attempt["period"] == period.get("number")
        )
        last_exit = last_non_ozone_seconds.get(shooter_team_id)
        is_rush = bool(last_exit is not None and 0 <= seconds - last_exit <= RUSH_WINDOW_SECONDS)

        rows.append(
            {
                "game_id": game_id,
                "event_id": play.get("eventId"),
                "sort_order": play.get("sortOrder"),
                "season_id": payload.get("season"),
                "period_number": period.get("number"),
                "period_type": period.get("periodType"),
                "game_seconds": seconds,
                "event_type": event_type,
                "is_goal": event_type == "goal",
                "shot_type": details.get("shotType"),
                "x_coord": details.get("xCoord"),
                "y_coord": details.get("yCoord"),
                "zone_code": details.get("zoneCode"),
                "distance_ft": distance,
                "angle_deg": angle,
                "team_abbrev": home_abbrev if is_home_shooter else away_abbrev,
                "opponent_abbrev": away_abbrev if is_home_shooter else home_abbrev,
                "is_home_team": is_home_shooter,
                "shooting_player_id": details.get("shootingPlayerId") or details.get("scoringPlayerId"),
                "goalie_in_net_id": details.get("goalieInNetId"),
                "is_empty_net": details.get("goalieInNetId") is None,
                "strength_state": strength_state(play.get("situationCode", ""), is_home_shooter),
                "is_rebound": is_rebound,
                "is_rush": is_rush,
            }
        )

        if event_type in UNBLOCKED_EVENTS:
            last_attempt = {
                "shooter_team_id": shooter_team_id,
                "seconds": seconds,
                "period": period.get("number"),
            }

    return rows
