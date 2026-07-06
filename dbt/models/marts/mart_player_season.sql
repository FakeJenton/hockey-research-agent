-- Skater season stat lines (goalies live in mart_goalie_season).
-- Combines the summary, realtime, timeonice, and bios reports:
-- totals, per-game rates, TOI-honest per-60 rates by strength state,
-- age, draft pedigree, and league percentile ranks (computed among
-- 20+ GP skaters within season and position group).
with summary as (
    select * from {{ ref('stg_skater_summary') }}
),

realtime as (
    select * from {{ ref('stg_skater_realtime') }}
),

toi as (
    select * from {{ ref('stg_skater_toi') }}
),

bios as (
    select * from {{ ref('stg_skater_bios') }}
),

base as (
    select
        concat(summary.player_id, '-', summary.season_id) as player_season_key,
        summary.player_id,
        summary.season_id,
        summary.full_name,
        summary.position_code,
        if(summary.position_code = 'D', 'D', 'F') as position_group,
        summary.team_abbrevs,
        bios.birth_date,
        -- age at the end of the regular season (Apr 15 of the season's second year)
        cast(floor(date_diff(
            date(cast(substr(cast(summary.season_id as string), 5, 4) as int64), 4, 15),
            bios.birth_date,
            day
        ) / 365.25) as int64) as age,
        bios.draft_year,
        bios.draft_round,
        bios.draft_overall,
        summary.games_played,
        summary.goals,
        summary.assists,
        summary.points,
        summary.shots,
        summary.shooting_pct,
        round(summary.toi_per_gp_seconds / 60, 2) as toi_minutes_per_gp,
        round(toi.ev_toi_per_gp_seconds / 60, 2) as ev_toi_minutes_per_gp,
        round(toi.pp_toi_per_gp_seconds / 60, 2) as pp_toi_minutes_per_gp,
        round(toi.sh_toi_per_gp_seconds / 60, 2) as sh_toi_minutes_per_gp,
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
        round(safe_divide(summary.penalty_minutes, summary.games_played), 4) as pim_per_gp,
        -- per-60 rates against the ice time actually played in that state:
        -- all-strengths for overall rates, EV TOI for EV rates, PP TOI for PP rates
        round(safe_divide(summary.goals * 3600, toi.toi_seconds), 4) as goals_per_60,
        round(safe_divide(summary.assists * 3600, toi.toi_seconds), 4) as assists_per_60,
        round(safe_divide(summary.points * 3600, toi.toi_seconds), 4) as points_per_60,
        round(safe_divide(summary.shots * 3600, toi.toi_seconds), 4) as shots_per_60,
        round(safe_divide(realtime.hits * 3600, toi.toi_seconds), 4) as hits_per_60,
        round(safe_divide(realtime.blocked_shots * 3600, toi.toi_seconds), 4) as blocks_per_60,
        round(safe_divide(summary.ev_points * 3600, toi.ev_toi_seconds), 4) as ev_points_per_60,
        round(safe_divide(summary.ev_goals * 3600, toi.ev_toi_seconds), 4) as ev_goals_per_60,
        round(safe_divide(summary.pp_points * 3600, toi.pp_toi_seconds), 4) as pp_points_per_60
    from summary
    left join realtime using (player_id, season_id)
    left join toi using (player_id, season_id)
    left join bios using (player_id, season_id)
),

-- percentile ranks among qualified skaters (20+ GP) within season + position group
percentiles as (
    select
        player_season_key,
        round(percent_rank() over (points_window), 3) as pct_points_per_gp,
        round(percent_rank() over (goals_window), 3) as pct_goals_per_gp,
        round(percent_rank() over (shots_window), 3) as pct_shots_per_gp,
        round(percent_rank() over (toi_window), 3) as pct_toi_per_gp,
        round(percent_rank() over (pp_window), 3) as pct_pp_points_per_gp,
        round(percent_rank() over (hits_window), 3) as pct_hits_per_gp,
        round(percent_rank() over (blocks_window), 3) as pct_blocks_per_gp,
        round(percent_rank() over (shooting_window), 3) as pct_shooting,
        round(percent_rank() over (plus_minus_window), 3) as pct_plus_minus,
        round(percent_rank() over (ev_p60_window), 3) as pct_ev_points_per_60
    from base
    where games_played >= 20
    window
        points_window as (partition by season_id, position_group order by points_per_gp),
        goals_window as (partition by season_id, position_group order by goals_per_gp),
        shots_window as (partition by season_id, position_group order by shots_per_gp),
        toi_window as (partition by season_id, position_group order by toi_minutes_per_gp),
        pp_window as (partition by season_id, position_group order by pp_points_per_gp),
        hits_window as (partition by season_id, position_group order by hits_per_gp),
        blocks_window as (partition by season_id, position_group order by blocks_per_gp),
        shooting_window as (partition by season_id, position_group order by shooting_pct),
        plus_minus_window as (partition by season_id, position_group order by plus_minus),
        ev_p60_window as (partition by season_id, position_group order by ev_points_per_60)
)

select
    base.*,
    percentiles.pct_points_per_gp,
    percentiles.pct_goals_per_gp,
    percentiles.pct_shots_per_gp,
    percentiles.pct_toi_per_gp,
    percentiles.pct_pp_points_per_gp,
    percentiles.pct_hits_per_gp,
    percentiles.pct_blocks_per_gp,
    percentiles.pct_shooting,
    percentiles.pct_plus_minus,
    percentiles.pct_ev_points_per_60
from base
left join percentiles using (player_season_key)
