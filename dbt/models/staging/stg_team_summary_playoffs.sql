-- PLAYOFF (gameTypeId=3) version of stg_team_summary.sql; same contract.
-- One row per team-season.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_team_summary_playoffs') }}
),

deduped as (
    select
        *,
        row_number() over (
            partition by teamId, season_id
            order by _loaded_at desc
        ) as row_num
    from source
)

select
    teamId as team_id,
    cast(season_id as int64) as season_id,
    teamFullName as team_name,
    gamesPlayed as games_played,
    wins,
    losses,
    otLosses as ot_losses,
    winsInRegulation as regulation_wins,
    winsInShootout as shootout_wins,
    points,
    pointPct as point_pct,
    goalsFor as goals_for,
    goalsAgainst as goals_against,
    goalsForPerGame as goals_for_per_game,
    goalsAgainstPerGame as goals_against_per_game,
    powerPlayPct as pp_pct,
    penaltyKillPct as pk_pct,
    powerPlayNetPct as pp_net_pct,
    penaltyKillNetPct as pk_net_pct,
    shotsForPerGame as shots_for_per_game,
    shotsAgainstPerGame as shots_against_per_game,
    faceoffWinPct as faceoff_win_pct,
    teamShutouts as shutouts
from deduped
where row_num = 1
