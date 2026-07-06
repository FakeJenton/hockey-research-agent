-- Skater biographical data per player-season: birth date (for age context
-- in similarity comps), draft pedigree, size.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_skater_bios') }}
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
    date(birthDate) as birth_date,
    birthCountryCode as birth_country,
    nationalityCode as nationality,
    height as height_inches,
    weight as weight_pounds,
    draftYear as draft_year,
    draftRound as draft_round,
    draftOverall as draft_overall,
    currentTeamAbbrev as current_team_abbrev
from deduped
where row_num = 1
