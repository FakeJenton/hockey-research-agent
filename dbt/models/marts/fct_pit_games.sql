-- Backward-compatible PIT slice of fct_team_games (the original demo mart
-- was Penguins-only; the 82-game sanity test still runs against this).
{{ config(materialized='view') }}

select *
from {{ ref('fct_team_games') }}
where team_abbrev = 'PIT'
