-- One row per player per game (already flattened at ingest).
with source as (
    select *
    from {{ source('nhl_raw', 'raw_player_games') }}
),

deduped as (
    select
        *,
        row_number() over (
            partition by game_id, player_id
            order by _loaded_at desc
        ) as row_num
    from source
)

select
    game_id,
    cast(season_id as int64) as season_id,
    date(game_date) as game_date,
    team_abbrev,
    opponent_abbrev,
    is_home,
    player_id,
    full_name,
    position_code,
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
    toi_seconds,
    shifts,
    saves,
    shots_against
from deduped
where row_num = 1
