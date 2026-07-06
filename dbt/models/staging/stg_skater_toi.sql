-- Ice time by strength state per player-season, in seconds. This report
-- exists because skater/summary carries only all-strengths TOI per game,
-- which cannot support even-strength or power-play per-60 rates.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_skater_toi') }}
),

deduped as (
    select
        *,
        row_number() over (
            partition by playerId, season_id
            order by _loaded_at desc
        ) as row_num
    from source
)

select
    playerId as player_id,
    cast(season_id as int64) as season_id,
    gamesPlayed as games_played,
    timeOnIce as toi_seconds,
    evTimeOnIce as ev_toi_seconds,
    ppTimeOnIce as pp_toi_seconds,
    shTimeOnIce as sh_toi_seconds,
    evTimeOnIcePerGame as ev_toi_per_gp_seconds,
    ppTimeOnIcePerGame as pp_toi_per_gp_seconds,
    shTimeOnIcePerGame as sh_toi_per_gp_seconds,
    shifts
from deduped
where row_num = 1
