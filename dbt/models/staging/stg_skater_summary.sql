-- One row per player-season. Raw loads are WRITE_TRUNCATE, but dedupe
-- defensively on the natural key anyway (latest load wins).
with source as (
    select *
    from {{ source('nhl_raw', 'raw_skater_summary') }}
),

deduped as (
    select
        *,
        row_number() over (
            partition by playerId, season_id
            order by _loaded_at desc
        ) as row_num
    from source
)

select
    playerId as player_id,
    cast(season_id as int64) as season_id,
    skaterFullName as full_name,
    positionCode as position_code,
    teamAbbrevs as team_abbrevs,
    shootsCatches as shoots_catches,
    gamesPlayed as games_played,
    goals,
    assists,
    points,
    plusMinus as plus_minus,
    penaltyMinutes as penalty_minutes,
    ppGoals as pp_goals,
    ppPoints as pp_points,
    shGoals as sh_goals,
    shPoints as sh_points,
    evGoals as ev_goals,
    evPoints as ev_points,
    gameWinningGoals as game_winning_goals,
    otGoals as ot_goals,
    shots,
    shootingPct as shooting_pct,
    safe_cast(faceoffWinPct as float64) as faceoff_win_pct,
    safe_cast(pointsPerGame as float64) as points_per_game,
    safe_cast(timeOnIcePerGame as float64) as toi_per_gp_seconds
from deduped
where row_num = 1
