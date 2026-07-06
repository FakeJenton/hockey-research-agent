-- Game-indexed rolling special-teams form: PP% and PK% over the last
-- 5/10/15 games (inclusive of the current game). Early-season windows use
-- however many games have been played.
with games as (
    select * from {{ ref('fct_pit_games') }}
)

select
    game_id,
    season_id,
    game_date,
    game_number,
    opponent,
    result,
    pp_goals_for,
    pp_opportunities,
    pp_goals_against,
    times_shorthanded,
    round(safe_divide(
        sum(pp_goals_for) over last_5,
        sum(pp_opportunities) over last_5
    ), 4) as pp_pct_last_5,
    round(safe_divide(
        sum(pp_goals_for) over last_10,
        sum(pp_opportunities) over last_10
    ), 4) as pp_pct_last_10,
    round(safe_divide(
        sum(pp_goals_for) over last_15,
        sum(pp_opportunities) over last_15
    ), 4) as pp_pct_last_15,
    round(1 - safe_divide(
        sum(pp_goals_against) over last_5,
        sum(times_shorthanded) over last_5
    ), 4) as pk_pct_last_5,
    round(1 - safe_divide(
        sum(pp_goals_against) over last_10,
        sum(times_shorthanded) over last_10
    ), 4) as pk_pct_last_10,
    round(1 - safe_divide(
        sum(pp_goals_against) over last_15,
        sum(times_shorthanded) over last_15
    ), 4) as pk_pct_last_15
from games
window
    last_5 as (order by game_number rows between 4 preceding and current row),
    last_10 as (order by game_number rows between 9 preceding and current row),
    last_15 as (order by game_number rows between 14 preceding and current row)
