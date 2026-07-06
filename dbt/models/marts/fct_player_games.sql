-- Player game logs: one row per player per 2025-26 game, with a per-player
-- chronological game_number so "last N games" questions are one filter.
-- Boxscores abbreviate names ("S. Crosby"), so the queryable full_name
-- resolves through dim_players.
with player_games as (
    select * from {{ ref('stg_player_games') }}
),

players as (
    select player_id, full_name from {{ ref('dim_players') }}
)

select
    concat(player_games.game_id, '-', player_games.player_id) as player_game_key,
    player_games.game_id,
    player_games.season_id,
    player_games.game_date,
    row_number() over (
        partition by player_games.player_id
        order by player_games.game_date, player_games.game_id
    ) as player_game_number,
    player_games.team_abbrev,
    player_games.opponent_abbrev,
    player_games.is_home,
    player_games.player_id,
    coalesce(players.full_name, player_games.full_name) as full_name,
    position_code,
    if(position_code = 'G', 'G', if(position_code = 'D', 'D', 'F')) as position_group,
    goals,
    assists,
    points,
    plus_minus,
    pim,
    hits,
    blocked_shots,
    pp_goals,
    shots,
    faceoff_pct,
    round(toi_seconds / 60, 2) as toi_minutes,
    shifts,
    saves,
    shots_against,
    round(safe_divide(saves, shots_against), 4) as save_pct
from player_games
left join players using (player_id)
