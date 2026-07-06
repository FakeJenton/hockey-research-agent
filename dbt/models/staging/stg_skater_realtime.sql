-- Hits/blocks/takeaways/giveaways per player-season. This report exists
-- because skater/summary does not carry hits or blocks.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_skater_realtime') }}
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
    hits,
    blockedShots as blocked_shots,
    giveaways,
    takeaways,
    hitsPer60 as hits_per_60,
    blockedShotsPer60 as blocked_shots_per_60
from deduped
where row_num = 1
