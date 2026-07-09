-- Team PLAYOFF results per season, all history. Games played reveals how
-- deep the run went; conference/division intentionally omitted (they are
-- current-alignment attributes, misleading for historical playoffs).
with team_summary as (
    select * from {{ ref('stg_team_summary_playoffs') }}
),

team_ref as (
    select * from {{ ref('stg_teams') }}
)

select
    concat(team_summary.team_id, '-', team_summary.season_id) as team_season_key,
    team_summary.team_id,
    team_ref.tri_code,
    team_summary.season_id,
    team_summary.team_name,
    team_summary.games_played,
    team_summary.wins,
    team_summary.losses,
    team_summary.goals_for,
    team_summary.goals_against,
    team_summary.goals_for_per_game,
    team_summary.goals_against_per_game,
    team_summary.pp_pct,
    team_summary.pk_pct,
    team_summary.shots_for_per_game,
    team_summary.shots_against_per_game,
    team_summary.faceoff_win_pct
from team_summary
left join team_ref using (team_id)
