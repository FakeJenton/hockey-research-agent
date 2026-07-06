-- One row per goalie-season.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_goalie_summary') }}
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
    goalieFullName as full_name,
    teamAbbrevs as team_abbrevs,
    shootsCatches as shoots_catches,
    gamesPlayed as games_played,
    gamesStarted as games_started,
    wins,
    losses,
    otLosses as ot_losses,
    savePct as save_pct,
    goalsAgainstAverage as goals_against_average,
    saves,
    shotsAgainst as shots_against,
    goalsAgainst as goals_against,
    shutouts,
    timeOnIce as toi_seconds
from deduped
where row_num = 1
