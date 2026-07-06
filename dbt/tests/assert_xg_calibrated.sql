-- Model-quality gate: league-wide predicted goals must land within 5% of
-- actual goals on the scored population. A drifted or broken model fails
-- the pipeline before its numbers reach the agent.
{{ config(tags=['xg']) }}

select
    sum(xg) as predicted_goals,
    countif(is_goal) as actual_goals
from {{ source('nhl_marts_ml', 'fct_shots') }}
where xg is not null
having abs(sum(xg) - countif(is_goal)) / countif(is_goal) > 0.05
