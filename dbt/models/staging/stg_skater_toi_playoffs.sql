-- PLAYOFF (gameTypeId=3) version of stg_skater_toi.sql; same contract.
-- Ice time by strength state per player-season, in seconds. This report
-- exists because skater/summary carries only all-strengths TOI per game,
-- which cannot support even-strength or power-play per-60 rates.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_skater_toi_playoffs') }}
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
    safe_cast(timeOnIce as float64) as toi_seconds,
    safe_cast(evTimeOnIce as float64) as ev_toi_seconds,
    safe_cast(ppTimeOnIce as float64) as pp_toi_seconds,
    safe_cast(shTimeOnIce as float64) as sh_toi_seconds,
    safe_cast(evTimeOnIcePerGame as float64) as ev_toi_per_gp_seconds,
    safe_cast(ppTimeOnIcePerGame as float64) as pp_toi_per_gp_seconds,
    safe_cast(shTimeOnIcePerGame as float64) as sh_toi_per_gp_seconds,
    shifts
from deduped
where row_num = 1
