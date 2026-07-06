-- Team xG for and against per season, with expected-goals share (xG%).
-- Depends on fct_shots, written by the xG scoring job (hence the xg tag).
{{ config(tags=['xg']) }}

with shots as (
    select * from {{ source('nhl_marts_ml', 'fct_shots') }}
    where xg is not null  -- model-eligible: unblocked, goalie in net
),

xg_for as (
    select
        team_abbrev,
        season_id,
        count(*) as unblocked_attempts_for,
        countif(is_goal) as goals_for_model,
        sum(xg) as xg_for
    from shots
    group by team_abbrev, season_id
),

xg_against as (
    select
        opponent_abbrev as team_abbrev,
        season_id,
        count(*) as unblocked_attempts_against,
        countif(is_goal) as goals_against_model,
        sum(xg) as xg_against
    from shots
    group by team_abbrev, season_id
)

select
    concat(xg_for.team_abbrev, '-', xg_for.season_id) as team_season_key,
    xg_for.team_abbrev,
    xg_for.season_id,
    xg_for.unblocked_attempts_for,
    xg_against.unblocked_attempts_against,
    xg_for.goals_for_model,
    xg_against.goals_against_model,
    round(xg_for.xg_for, 2) as xg_for,
    round(xg_against.xg_against, 2) as xg_against,
    round(safe_divide(xg_for.xg_for, xg_for.xg_for + xg_against.xg_against), 4) as xg_share,
    round(xg_for.goals_for_model - xg_for.xg_for, 2) as goals_above_expected_for,
    -- negative = goaltending/defense giving up fewer than expected
    round(xg_against.goals_against_model - xg_against.xg_against, 2) as goals_above_expected_against
from xg_for
inner join xg_against
    using (team_abbrev, season_id)
