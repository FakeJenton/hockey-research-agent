-- One row per team per game for every 2025-26 regular season game
-- (1,312 games x 2 perspectives = 2,624 rows). Each row reads from that
-- team's point of view: opponent, score, result, special teams for/against.
with schedule as (
    select * from {{ ref('stg_schedule') }}
),

game_stats as (
    select * from {{ ref('stg_team_game_stats') }}
),

home_perspective as (
    select
        schedule.game_id,
        schedule.season_id,
        schedule.game_date,
        schedule.home_abbrev as team_abbrev,
        schedule.away_abbrev as opponent,
        true as is_home,
        schedule.home_score as goals_for,
        schedule.away_score as goals_against,
        schedule.last_period_type,
        game_stats.home_pp_goals as pp_goals_for,
        game_stats.home_pp_opportunities as pp_opportunities,
        game_stats.away_pp_goals as pp_goals_against,
        game_stats.away_pp_opportunities as times_shorthanded,
        game_stats.home_sog as shots_for,
        game_stats.away_sog as shots_against,
        game_stats.home_pim as pim,
        game_stats.home_hits as hits,
        game_stats.home_blocked_shots as blocked_shots,
        game_stats.home_faceoff_pct as faceoff_pct
    from schedule
    inner join game_stats using (game_id)
),

away_perspective as (
    select
        schedule.game_id,
        schedule.season_id,
        schedule.game_date,
        schedule.away_abbrev as team_abbrev,
        schedule.home_abbrev as opponent,
        false as is_home,
        schedule.away_score as goals_for,
        schedule.home_score as goals_against,
        schedule.last_period_type,
        game_stats.away_pp_goals as pp_goals_for,
        game_stats.away_pp_opportunities as pp_opportunities,
        game_stats.home_pp_goals as pp_goals_against,
        game_stats.home_pp_opportunities as times_shorthanded,
        game_stats.away_sog as shots_for,
        game_stats.home_sog as shots_against,
        game_stats.away_pim as pim,
        game_stats.away_hits as hits,
        game_stats.away_blocked_shots as blocked_shots,
        game_stats.away_faceoff_pct as faceoff_pct
    from schedule
    inner join game_stats using (game_id)
),

unioned as (
    select * from home_perspective
    union all
    select * from away_perspective
)

select
    concat(game_id, '-', team_abbrev) as game_team_key,
    game_id,
    season_id,
    game_date,
    row_number() over (
        partition by team_abbrev
        order by game_date, game_id
    ) as game_number,
    -- schedule context: days since this team's previous game (null for the opener)
    date_diff(
        game_date,
        lag(game_date) over (partition by team_abbrev order by game_date, game_id),
        day
    ) as rest_days,
    coalesce(
        date_diff(
            game_date,
            lag(game_date) over (partition by team_abbrev order by game_date, game_id),
            day
        ) = 1,
        false
    ) as is_back_to_back,
    team_abbrev,
    opponent,
    is_home,
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
from unioned
