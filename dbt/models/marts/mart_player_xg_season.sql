-- Shooter xG per player per season: expected goals from the shot-level
-- model vs actual goals. Depends on fct_shots, which the xG scoring job
-- writes after the base dbt run (hence the xg tag).
{{ config(tags=['xg']) }}

with shots as (
    select * from {{ source('nhl_marts_ml', 'fct_shots') }}
    where xg is not null  -- model-eligible: unblocked, goalie in net
),

players as (
    select * from {{ ref('dim_players') }}
)

select
    concat(shots.shooting_player_id, '-', shots.season_id) as player_season_key,
    shots.shooting_player_id as player_id,
    shots.season_id,
    players.full_name,
    players.position_group,
    count(*) as unblocked_attempts,
    countif(shots.is_goal) as goals,
    round(sum(shots.xg), 2) as expected_goals,
    round(countif(shots.is_goal) - sum(shots.xg), 2) as goals_above_expected,
    round(safe_divide(sum(shots.xg), count(*)), 4) as xg_per_attempt,
    countif(shots.is_rebound) as rebound_attempts,
    countif(shots.is_rush) as rush_attempts,
    round(avg(shots.distance_ft), 1) as avg_shot_distance_ft
from shots
left join players
    on players.player_id = shots.shooting_player_id
group by player_season_key, player_id, season_id, full_name, position_group
