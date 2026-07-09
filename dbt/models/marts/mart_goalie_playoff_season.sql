-- Goalie PLAYOFF stat lines per season, all history.
with summary as (
    select * from {{ ref('stg_goalie_summary_playoffs') }}
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
    summary.games_played,
    summary.games_started,
    summary.wins,
    summary.losses,
    summary.ot_losses,
    summary.save_pct,
    summary.goals_against_average,
    summary.saves,
    summary.shots_against,
    summary.goals_against,
    summary.shutouts,
    round(summary.toi_seconds / 60, 1) as toi_minutes
from summary
left join bios using (player_id, season_id)
