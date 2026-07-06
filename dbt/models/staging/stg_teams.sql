-- Team reference list. Includes defunct franchises; dim_teams filters to
-- active teams by joining to the season summary.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_teams') }}
),

deduped as (
    select
        *,
        row_number() over (partition by id order by _loaded_at desc) as row_num
    from source
)

select
    id as team_id,
    fullName as team_name,
    triCode as tri_code,
    franchiseId as franchise_id
from deduped
where row_num = 1
