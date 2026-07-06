-- Team-level game stats for every 2025-26 game, pivoted from the right-rail
-- teamGameStats category list. powerPlay arrives as a "goals/opportunities"
-- string (e.g. "0/2") and is split into numeric columns here.
with source as (
    select *
    from {{ source('nhl_raw', 'raw_rightrail') }}
),

deduped as (
    select
        *,
        row_number() over (partition by game_id order by _loaded_at desc) as row_num
    from source
),

categories as (
    select
        deduped.game_id,
        cast(deduped.season_id as int64) as season_id,
        json_value(stat, '$.category') as category,
        json_value(stat, '$.awayValue') as away_value,
        json_value(stat, '$.homeValue') as home_value
    from deduped,
        unnest(json_extract_array(payload, '$.teamGameStats')) as stat
    where deduped.row_num = 1
),

pivoted as (
    select
        game_id,
        season_id,
        max(if(category = 'sog', away_value, null)) as away_sog,
        max(if(category = 'sog', home_value, null)) as home_sog,
        max(if(category = 'powerPlay', away_value, null)) as away_pp,
        max(if(category = 'powerPlay', home_value, null)) as home_pp,
        max(if(category = 'pim', away_value, null)) as away_pim,
        max(if(category = 'pim', home_value, null)) as home_pim,
        max(if(category = 'hits', away_value, null)) as away_hits,
        max(if(category = 'hits', home_value, null)) as home_hits,
        max(if(category = 'blockedShots', away_value, null)) as away_blocked_shots,
        max(if(category = 'blockedShots', home_value, null)) as home_blocked_shots,
        max(if(category = 'giveaways', away_value, null)) as away_giveaways,
        max(if(category = 'giveaways', home_value, null)) as home_giveaways,
        max(if(category = 'takeaways', away_value, null)) as away_takeaways,
        max(if(category = 'takeaways', home_value, null)) as home_takeaways,
        max(if(category = 'faceoffWinningPctg', away_value, null)) as away_faceoff_pct,
        max(if(category = 'faceoffWinningPctg', home_value, null)) as home_faceoff_pct
    from categories
    group by game_id, season_id
)

select
    game_id,
    season_id,
    cast(away_sog as int64) as away_sog,
    cast(home_sog as int64) as home_sog,
    cast(split(away_pp, '/')[offset(0)] as int64) as away_pp_goals,
    cast(split(away_pp, '/')[offset(1)] as int64) as away_pp_opportunities,
    cast(split(home_pp, '/')[offset(0)] as int64) as home_pp_goals,
    cast(split(home_pp, '/')[offset(1)] as int64) as home_pp_opportunities,
    cast(away_pim as int64) as away_pim,
    cast(home_pim as int64) as home_pim,
    cast(away_hits as int64) as away_hits,
    cast(home_hits as int64) as home_hits,
    cast(away_blocked_shots as int64) as away_blocked_shots,
    cast(home_blocked_shots as int64) as home_blocked_shots,
    cast(away_giveaways as int64) as away_giveaways,
    cast(home_giveaways as int64) as home_giveaways,
    cast(away_takeaways as int64) as away_takeaways,
    cast(home_takeaways as int64) as home_takeaways,
    cast(away_faceoff_pct as float64) as away_faceoff_pct,
    cast(home_faceoff_pct as float64) as home_faceoff_pct
from pivoted
