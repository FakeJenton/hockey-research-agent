-- Goalie season stat lines: workload, results, and rate stats, with age
-- and draft context from the bios report.
with summary as (
    select * from {{ ref('stg_goalie_summary') }}
),

bios as (
    select * from {{ ref('stg_goalie_bios') }}
)

select
    concat(summary.player_id, '-', summary.season_id) as player_season_key,
    summary.player_id,
    summary.season_id,
    summary.full_name,
    'G' as position_code,
    'G' as position_group,
    summary.team_abbrevs,
    bios.birth_date,
    cast(floor(date_diff(
        date(cast(substr(cast(summary.season_id as string), 5, 4) as int64), 4, 15),
        bios.birth_date,
        day
    ) / 365.25) as int64) as age,
    bios.draft_year,
    bios.draft_round,
    bios.draft_overall,
    summary.games_played,
    summary.games_started,
    summary.wins,
    summary.losses,
    summary.ot_losses,
    round(safe_divide(summary.wins, summary.games_started), 4) as win_pct_per_start,
    summary.save_pct,
    summary.goals_against_average,
    summary.saves,
    summary.shots_against,
    summary.goals_against,
    summary.shutouts,
    round(summary.toi_seconds / 60, 1) as toi_minutes,
    round(safe_divide(summary.saves, summary.games_started), 2) as saves_per_start,
    round(safe_divide(summary.shots_against, summary.games_started), 2) as shots_against_per_start,
    round(safe_divide(summary.shutouts, summary.games_started), 4) as shutout_rate
from summary
left join bios using (player_id, season_id)
