-- Season-end standings snapshot; one row per team. Name fields arrive as
-- RECORDs with a `default` locale key.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_standings') }}
),

deduped as (
    select
        *,
        row_number() over (
            partition by teamAbbrev.default, season_id
            order by _loaded_at desc
        ) as row_num
    from source
)

select
    teamAbbrev.default as team_abbrev,
    teamName.default as team_name,
    cast(season_id as int64) as season_id,
    conferenceName as conference,
    divisionName as division,
    gamesPlayed as games_played,
    wins,
    losses,
    otLosses as ot_losses,
    points,
    pointPctg as point_pct,
    goalFor as goals_for,
    goalAgainst as goals_against,
    goalDifferential as goal_differential,
    leagueSequence as league_rank,
    conferenceSequence as conference_rank,
    divisionSequence as division_rank,
    wildcardSequence as wildcard_rank,
    streakCode as streak_code,
    streakCount as streak_count
from deduped
where row_num = 1
