-- Team season summaries with the team tricode for easy filtering.
-- Tricode resolves through the full team reference (not dim_teams) because
-- rebrands mint a new team_id: 2024-25 Utah (id 59) must still map to UTA.
with team_summary as (
    select * from {{ ref('stg_team_summary') }}
),

team_ref as (
    select * from {{ ref('stg_teams') }}
),

teams as (
    select * from {{ ref('dim_teams') }}
)

select
    concat(team_summary.team_id, '-', team_summary.season_id) as team_season_key,
    team_summary.team_id,
    team_ref.tri_code,
    team_summary.season_id,
    team_summary.team_name,
    teams.conference,
    teams.division,
    team_summary.games_played,
    team_summary.wins,
    team_summary.losses,
    team_summary.ot_losses,
    team_summary.regulation_wins,
    team_summary.shootout_wins,
    team_summary.points,
    team_summary.point_pct,
    team_summary.goals_for,
    team_summary.goals_against,
    team_summary.goals_for_per_game,
    team_summary.goals_against_per_game,
    team_summary.pp_pct,
    team_summary.pk_pct,
    team_summary.pp_net_pct,
    team_summary.pk_net_pct,
    team_summary.shots_for_per_game,
    team_summary.shots_against_per_game,
    team_summary.faceoff_win_pct,
    team_summary.shutouts
from team_summary
left join team_ref
    using (team_id)
left join teams
    on teams.tri_code = team_ref.tri_code
