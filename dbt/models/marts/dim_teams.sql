-- The 32 active NHL franchises, one row per tricode, carrying the team's
-- current identity. Grain note: the NHL assigns a NEW teamId on rebrand
-- (Utah Hockey Club id 59 in 2024-25 became Utah Mammoth id 68 in 2025-26,
-- both tricode UTA), so team_id alone over-counts franchises; we keep the
-- team_id from each franchise's most recent season.
with teams as (
    select * from {{ ref('stg_teams') }}
),

active_seasons as (
    select
        team_id,
        max(season_id) as latest_season_id
    from {{ ref('stg_team_summary') }}
    group by team_id
),

ranked as (
    select
        teams.team_id,
        teams.team_name,
        teams.tri_code,
        active_seasons.latest_season_id,
        row_number() over (
            partition by teams.tri_code
            order by active_seasons.latest_season_id desc
        ) as row_num
    from teams
    inner join active_seasons using (team_id)
),

standings as (
    select * from {{ ref('stg_standings') }}
)

select
    ranked.team_id,
    ranked.team_name,
    ranked.tri_code,
    standings.conference,
    standings.division
from ranked
left join standings
    on standings.team_abbrev = ranked.tri_code
where ranked.row_num = 1
