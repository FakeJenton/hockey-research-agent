-- One row per PIT regular-season game, from PIT's perspective:
-- opponent, score, result, and special-teams counting stats.
with schedule as (
    select * from {{ ref('stg_pit_schedule') }}
),

game_stats as (
    select * from {{ ref('stg_pit_team_game_stats') }}
),

oriented as (
    select
        schedule.game_id,
        schedule.season_id,
        schedule.game_date,
        schedule.home_abbrev = 'PIT' as is_home,
        if(schedule.home_abbrev = 'PIT', schedule.away_abbrev, schedule.home_abbrev) as opponent,
        if(schedule.home_abbrev = 'PIT', schedule.home_score, schedule.away_score) as goals_for,
        if(schedule.home_abbrev = 'PIT', schedule.away_score, schedule.home_score) as goals_against,
        schedule.last_period_type,
        if(schedule.home_abbrev = 'PIT', game_stats.home_pp_goals, game_stats.away_pp_goals) as pp_goals_for,
        if(schedule.home_abbrev = 'PIT', game_stats.home_pp_opportunities, game_stats.away_pp_opportunities) as pp_opportunities,
        -- opponent's power play, i.e. the PIT penalty kill
        if(schedule.home_abbrev = 'PIT', game_stats.away_pp_goals, game_stats.home_pp_goals) as pp_goals_against,
        if(schedule.home_abbrev = 'PIT', game_stats.away_pp_opportunities, game_stats.home_pp_opportunities) as times_shorthanded,
        if(schedule.home_abbrev = 'PIT', game_stats.home_sog, game_stats.away_sog) as shots_for,
        if(schedule.home_abbrev = 'PIT', game_stats.away_sog, game_stats.home_sog) as shots_against,
        if(schedule.home_abbrev = 'PIT', game_stats.home_pim, game_stats.away_pim) as pim,
        if(schedule.home_abbrev = 'PIT', game_stats.home_hits, game_stats.away_hits) as hits,
        if(schedule.home_abbrev = 'PIT', game_stats.home_blocked_shots, game_stats.away_blocked_shots) as blocked_shots,
        if(schedule.home_abbrev = 'PIT', game_stats.home_faceoff_pct, game_stats.away_faceoff_pct) as faceoff_pct
    from schedule
    inner join game_stats
        using (game_id)
)

select
    game_id,
    season_id,
    game_date,
    row_number() over (order by game_date, game_id) as game_number,
    is_home,
    opponent,
    goals_for,
    goals_against,
    case
        when goals_for > goals_against then 'W'
        when last_period_type = 'REG' then 'L'
        else 'OTL'
    end as result,
    last_period_type,
    pp_goals_for,
    pp_opportunities,
    pp_goals_against,
    times_shorthanded,
    shots_for,
    shots_against,
    pim,
    hits,
    blocked_shots,
    faceoff_pct
from oriented
