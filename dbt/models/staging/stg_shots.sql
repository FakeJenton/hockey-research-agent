-- One row per shot attempt (already flattened at ingest; this view renames
-- nothing but enforces the dedupe contract on the natural key).
with source as (
    select *
    from {{ source('nhl_raw', 'raw_shots') }}
),

deduped as (
    select
        *,
        row_number() over (
            partition by game_id, event_id
            order by _loaded_at desc
        ) as row_num
    from source
)

select
    game_id,
    event_id,
    cast(season_id as int64) as season_id,
    period_number,
    period_type,
    game_seconds,
    event_type,
    is_goal,
    shot_type,
    x_coord,
    y_coord,
    zone_code,
    distance_ft,
    angle_deg,
    team_abbrev,
    opponent_abbrev,
    is_home_team,
    shooting_player_id,
    goalie_in_net_id,
    is_empty_net,
    strength_state,
    is_rebound,
    is_rush
from deduped
where row_num = 1
