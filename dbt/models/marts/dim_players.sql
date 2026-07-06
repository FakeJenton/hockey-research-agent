-- One row per player across both ingested seasons; latest season wins for
-- name/team/position. position_group buckets forwards (C/L/R) as F.
with skaters as (
    select
        player_id,
        season_id,
        full_name,
        position_code,
        team_abbrevs
    from {{ ref('stg_skater_summary') }}
),

goalies as (
    select
        player_id,
        season_id,
        full_name,
        'G' as position_code,
        team_abbrevs
    from {{ ref('stg_goalie_summary') }}
),

unioned as (
    select * from skaters
    union all
    select * from goalies
),

latest as (
    select
        *,
        row_number() over (
            partition by player_id
            order by season_id desc
        ) as row_num
    from unioned
)

select
    player_id,
    full_name,
    position_code,
    case
        when position_code = 'G' then 'G'
        when position_code = 'D' then 'D'
        else 'F'
    end as position_group,
    team_abbrevs as latest_team_abbrevs,
    -- traded players list all stops ("BUF, STL"); keep the final one
    trim(array_reverse(split(team_abbrevs, ','))[offset(0)]) as current_team_abbrev,
    season_id as latest_season_id
from latest
where row_num = 1
