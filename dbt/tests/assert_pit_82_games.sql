-- Sanity check: a full NHL regular season is exactly 82 games.
-- Fails (returns a row) if fct_pit_games has any other count.
select
    count(*) as game_count
from {{ ref('fct_pit_games') }}
having count(*) != 82
