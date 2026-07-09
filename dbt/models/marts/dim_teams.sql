-- One row per franchise tricode that has ever played an NHL season,
-- carrying the most recent identity for that tricode. Grain notes:
-- - The NHL mints a NEW teamId on rebrand (Utah Hockey Club id 59 became
--   Utah Mammoth id 68, both UTA), so a teamId grain over-counts; the
--   most recent team_id per tricode wins.
-- - With full history ingested, defunct franchises (QUE, HFD, ...) are
--   real rows: is_active separates the current 32.
-- - conference/division come from the current standings and are null for
--   defunct franchises.
with teams as (
    select * from {{ ref('stg_teams') }}
),

team_seasons as (
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
        team_seasons.latest_season_id,
        row_number() over (
            partition by teams.tri_code
            order by team_seasons.latest_season_id desc
        ) as row_num
    from teams
    inner join team_seasons using (team_id)
),

standings as (
    select * from {{ ref('stg_standings') }}
)

select
    ranked.team_id,
    ranked.team_name,
    ranked.tri_code,
    ranked.latest_season_id,
    ranked.latest_season_id = 20252026 as is_active,
    standings.conference,
    standings.division
from ranked
left join standings
    on standings.team_abbrev = ranked.tri_code
where ranked.row_num = 1
