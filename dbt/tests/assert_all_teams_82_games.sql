-- Sanity check: every one of the 32 teams plays exactly 82 regular season
-- games. Fails (returns rows) if any team has a different count.
select
    team_abbrev,
    count(*) as game_count
from {{ ref('fct_team_games') }}
group by team_abbrev
having count(*) != 82
