-- Skater PLAYOFF stat lines per season, all history. Age/draft context
-- joins from the regular-season bios (bios are game-type independent).
with summary as (
    select * from {{ ref('stg_skater_summary_playoffs') }}
),

realtime as (
    select * from {{ ref('stg_skater_realtime_playoffs') }}
),

toi as (
    select * from {{ ref('stg_skater_toi_playoffs') }}
),

bios as (
    select * from {{ ref('stg_skater_bios') }}
)

select
    concat(summary.player_id, '-', summary.season_id) as player_season_key,
    summary.player_id,
    summary.season_id,
    summary.full_name,
    summary.position_code,
    if(summary.position_code = 'D', 'D', 'F') as position_group,
    summary.team_abbrevs,
    bios.birth_date,
    summary.games_played,
    summary.goals,
    summary.assists,
    summary.points,
    summary.shots,
    summary.shooting_pct,
    round(summary.toi_per_gp_seconds / 60, 2) as toi_minutes_per_gp,
    summary.pp_goals,
    summary.pp_points,
    summary.sh_goals,
    summary.sh_points,
    summary.ev_goals,
    summary.ev_points,
    summary.game_winning_goals,
    realtime.hits,
    realtime.blocked_shots,
    summary.penalty_minutes as pim,
    summary.plus_minus,
    summary.faceoff_win_pct as faceoff_pct,
    round(safe_divide(summary.goals, summary.games_played), 4) as goals_per_gp,
    round(safe_divide(summary.points, summary.games_played), 4) as points_per_gp,
    round(safe_divide(summary.ev_points * 3600, toi.ev_toi_seconds), 4) as ev_points_per_60,
    round(safe_divide(summary.pp_points * 3600, toi.pp_toi_seconds), 4) as pp_points_per_60
from summary
left join realtime using (player_id, season_id)
left join toi using (player_id, season_id)
left join bios using (player_id, season_id)
