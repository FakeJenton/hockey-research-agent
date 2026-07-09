-- One row per 2025-26 regular-season game, parsed from the raw schedule JSON.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_schedule') }}
),

deduped as (
    select
        *,
        row_number() over (partition by game_id order by _loaded_at desc) as row_num
    from source
)

select
    game_id,
    -- digits 5-6 of the game id: 02 = regular season, 03 = playoffs
    cast(substr(cast(game_id as string), 5, 2) as int64) as game_type,
    cast(season_id as int64) as season_id,
    date(json_value(payload, '$.gameDate')) as game_date,
    json_value(payload, '$.gameState') as game_state,
    json_value(payload, '$.homeTeam.abbrev') as home_abbrev,
    json_value(payload, '$.awayTeam.abbrev') as away_abbrev,
    cast(json_value(payload, '$.homeTeam.score') as int64) as home_score,
    cast(json_value(payload, '$.awayTeam.score') as int64) as away_score,
    -- REG / OT / SO
    json_value(payload, '$.gameOutcome.lastPeriodType') as last_period_type,
    timestamp(json_value(payload, '$.startTimeUTC')) as start_time_utc,
    json_value(payload, '$.venue.default') as venue
from deduped
where row_num = 1
