-- Skater season stat lines (goalies live in stg_goalie_summary / dim_players).
-- Combines the summary and realtime reports; per-game rates included for
-- similarity features and per-game questions.
with summary as (
    select * from {{ ref('stg_skater_summary') }}
),

realtime as (
    select * from {{ ref('stg_skater_realtime') }}
)

select
    concat(summary.player_id, '-', summary.season_id) as player_season_key,
    summary.player_id,
    summary.season_id,
    summary.full_name,
    summary.position_code,
    if(summary.position_code = 'D', 'D', 'F') as position_group,
    summary.team_abbrevs,
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
    realtime.takeaways,
    realtime.giveaways,
    summary.penalty_minutes as pim,
    summary.plus_minus,
    -- centers mostly; null for wingers/D who never took a draw
    summary.faceoff_win_pct as faceoff_pct,
    round(safe_divide(summary.goals, summary.games_played), 4) as goals_per_gp,
    round(safe_divide(summary.assists, summary.games_played), 4) as assists_per_gp,
    round(safe_divide(summary.points, summary.games_played), 4) as points_per_gp,
    round(safe_divide(summary.shots, summary.games_played), 4) as shots_per_gp,
    round(safe_divide(summary.pp_points, summary.games_played), 4) as pp_points_per_gp,
    round(safe_divide(realtime.hits, summary.games_played), 4) as hits_per_gp,
    round(safe_divide(realtime.blocked_shots, summary.games_played), 4) as blocks_per_gp,
    round(safe_divide(summary.penalty_minutes, summary.games_played), 4) as pim_per_gp
from summary
left join realtime
    using (player_id, season_id)
