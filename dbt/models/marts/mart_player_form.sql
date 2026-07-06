-- Rolling form per skater per game: last-10 production vs season baseline,
-- with rolling xG so hot streaks split into "shooting more" vs "finishing
-- above expected". Depends on fct_shots (hence the xg tag).
{{ config(tags=['xg']) }}

with games as (
    select * from {{ ref('fct_player_games') }}
    where position_code != 'G'
),

game_xg as (
    select
        game_id,
        shooting_player_id as player_id,
        sum(xg) as xg
    from {{ source('nhl_marts_ml', 'fct_shots') }}
    where xg is not null
    group by game_id, player_id
),

season as (
    select player_id, season_id, points_per_gp as season_points_per_gp
    from {{ ref('mart_player_season') }}
),

joined as (
    select
        games.*,
        coalesce(game_xg.xg, 0) as game_xg
    from games
    left join game_xg using (game_id, player_id)
),

rolling as (
    select
        player_game_key,
        game_id,
        season_id,
        game_date,
        player_game_number,
        player_id,
        full_name,
        position_group,
        team_abbrev,
        opponent_abbrev,
        goals,
        assists,
        points,
        shots,
        least(player_game_number, 10) as games_in_window,
        sum(points) over last_10 as points_last_10,
        sum(goals) over last_10 as goals_last_10,
        sum(shots) over last_10 as shots_last_10,
        round(sum(game_xg) over last_10, 2) as xg_last_10
    from joined
    window last_10 as (
        partition by player_id
        order by player_game_number
        rows between 9 preceding and current row
    )
)

select
    rolling.*,
    round(safe_divide(rolling.points_last_10, rolling.games_in_window), 3) as points_per_gp_last_10,
    round(rolling.goals_last_10 - rolling.xg_last_10, 2) as finishing_last_10,
    season.season_points_per_gp,
    -- positive = running hotter than their own season baseline
    round(
        safe_divide(rolling.points_last_10, rolling.games_in_window) - season.season_points_per_gp,
        3
    ) as form_delta
from rolling
left join season using (player_id, season_id)
