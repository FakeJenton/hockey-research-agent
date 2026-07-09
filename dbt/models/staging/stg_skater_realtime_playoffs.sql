-- PLAYOFF (gameTypeId=3) version of stg_skater_realtime.sql; same contract.
-- Hits/blocks/takeaways/giveaways per player-season. This report exists
-- because skater/summary does not carry hits or blocks.
--
-- Era guard: for pre-tracking seasons the API returns FALSE ZEROS rather
-- than nulls (every skater in 1980-81 "has" 0 hits). Any stat whose
-- league-wide season total is zero clearly was not tracked that season,
-- so it is nulled rather than summed into career totals as real zeros.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_skater_realtime_playoffs') }}
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
    if(sum(hits) over (partition by season_id) > 0, hits, null) as hits,
    if(sum(blockedShots) over (partition by season_id) > 0, blockedShots, null) as blocked_shots,
    if(sum(giveaways) over (partition by season_id) > 0, giveaways, null) as giveaways,
    if(sum(takeaways) over (partition by season_id) > 0, takeaways, null) as takeaways,
    if(sum(hits) over (partition by season_id) > 0, hitsPer60, null) as hits_per_60,
    if(sum(blockedShots) over (partition by season_id) > 0, blockedShotsPer60, null) as blocked_shots_per_60
from deduped
where row_num = 1
